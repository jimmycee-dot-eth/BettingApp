import type { MarketEvent, ArbResult, OutcomeBest } from "./types";

// Core arbitrage math.
//
// For an event with outcomes o1..oN, take the BEST (highest) decimal odds for
// each outcome across the *enabled* providers. Each outcome's implied
// probability is 1/odds. If the sum of implied probabilities is < 1, a
// risk-free arbitrage exists: staking proportionally locks in an equal payout
// regardless of result.
//
//   totalImplied  = Σ (1 / bestOdds_i)
//   profit factor = 1 / totalImplied           (payout per $1 staked)
//   profit %      = (1 / totalImplied - 1) * 100
//   stake_i       = (1 / bestOdds_i) / totalImplied   (fraction of bankroll)
//
// Example: odds 2.10 and 2.10  -> implied 0.4762+0.4762 = 0.9524 -> 5.0% arb.
// The user's "> 2-1 on each of two outcomes" is exactly totalImplied < 1.

export function computeArb(
  event: MarketEvent,
  enabledProviders: Set<string>,
): ArbResult {
  const bests: OutcomeBest[] = event.outcomes.map((o) => {
    let best = 0;
    let bestProvider: string | null = null;
    let minOdds = Infinity;
    for (const q of o.quotes) {
      if (!enabledProviders.has(q.providerKey)) continue;
      if (q.decimalOdds > best) {
        best = q.decimalOdds;
        bestProvider = q.providerKey;
      }
      if (q.decimalOdds < minOdds) minOdds = q.decimalOdds;
    }
    return {
      outcomeKey: o.key,
      label: o.label,
      bestDecimalOdds: best,
      bestProviderKey: bestProvider,
      impliedProb: best > 0 ? 1 / best : 1, // no price => treat as certain (kills arb)
    };
  });

  const priced = bests.filter((b) => b.bestDecimalOdds > 0);
  const allOutcomesPriced = priced.length === bests.length && bests.length > 0;

  const totalImpliedProb = bests.reduce((s, b) => s + b.impliedProb, 0);
  const overroundPct = (totalImpliedProb - 1) * 100;
  const isArb = allOutcomesPriced && totalImpliedProb < 1;
  const profitPct = isArb ? (1 / totalImpliedProb - 1) * 100 : 0;

  const stakeSplit = bests.map((b) => ({
    outcomeKey: b.outcomeKey,
    fraction: totalImpliedProb > 0 ? b.impliedProb / totalImpliedProb : 0,
  }));

  // Largest spread between best and worst price on a single outcome — the
  // "gap in the market" the user wants to see even when it's not a full arb.
  let maxGapPct = 0;
  for (const o of event.outcomes) {
    const odds = o.quotes
      .filter((q) => enabledProviders.has(q.providerKey))
      .map((q) => q.decimalOdds);
    if (odds.length < 2) continue;
    const hi = Math.max(...odds);
    const lo = Math.min(...odds);
    if (lo > 0) {
      const gap = ((hi - lo) / lo) * 100;
      if (gap > maxGapPct) maxGapPct = gap;
    }
  }

  return {
    eventId: event.id,
    outcomes: bests,
    totalImpliedProb,
    overroundPct,
    isArb,
    profitPct,
    stakeSplit,
    maxGapPct,
  };
}

// Given a bankroll, return the exact per-outcome stakes and locked payout.
export function stakePlan(
  arb: ArbResult,
  bankroll: number,
): { outcomeKey: string; label: string; stake: number; onOdds: number; provider: string | null }[] {
  return arb.stakeSplit.map((s) => {
    const best = arb.outcomes.find((o) => o.outcomeKey === s.outcomeKey)!;
    return {
      outcomeKey: s.outcomeKey,
      label: best.label,
      stake: bankroll * s.fraction,
      onOdds: best.bestDecimalOdds,
      provider: best.bestProviderKey,
    };
  });
}
