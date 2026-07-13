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
  // Only a "match" market with every outcome priced is a complete, mutually
  // exclusive field where sum(implied) < 1 is a genuine risk-free arb. Futures
  // markets quote only a subset of competitors, so the Dutch-book maths does
  // not hold — never flag them as arbs (we surface value gaps instead).
  const isArb = event.category !== "futures" && allOutcomesPriced && totalImpliedProb < 1;
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

// For futures: the biggest price discrepancy between the best sportsbook and
// the best prediction-market quote on a single competitor. This is the "value"
// signal — where one venue is offering materially longer odds than the other.
export interface ValueGap {
  label: string;
  bookOdds: number;
  predOdds: number;
  // The venue offering the higher (better-to-back) price, and by how much.
  betterSide: "book" | "prediction";
  gapPct: number;
}

export function bestValueGap(
  event: MarketEvent,
  enabledProviders: Set<string>,
  predictionKeys: Set<string>,
): ValueGap | null {
  let best: ValueGap | null = null;
  for (const o of event.outcomes) {
    let bookOdds = 0;
    let predOdds = 0;
    for (const q of o.quotes) {
      if (!enabledProviders.has(q.providerKey)) continue;
      if (predictionKeys.has(q.providerKey)) predOdds = Math.max(predOdds, q.decimalOdds);
      else bookOdds = Math.max(bookOdds, q.decimalOdds);
    }
    if (bookOdds <= 0 || predOdds <= 0) continue;
    const hi = Math.max(bookOdds, predOdds);
    const lo = Math.min(bookOdds, predOdds);
    const gapPct = ((hi - lo) / lo) * 100;
    if (!best || gapPct > best.gapPct) {
      best = {
        label: o.label,
        bookOdds,
        predOdds,
        betterSide: predOdds > bookOdds ? "prediction" : "book",
        gapPct,
      };
    }
  }
  return best;
}

// Pure arb calculation from a raw list of decimal odds (one per outcome).
// Used by the what-if calculator where the user supplies their own prices.
export function arbFromOdds(odds: number[]): {
  totalImplied: number;
  profitPct: number;
  isArb: boolean;
  fractions: number[];
} {
  const allPriced = odds.length > 0 && odds.every((o) => o > 0);
  const totalImplied = odds.reduce((s, o) => s + (o > 0 ? 1 / o : 0), 0);
  const isArb = allPriced && totalImplied < 1;
  const profitPct = isArb ? (1 / totalImplied - 1) * 100 : 0;
  const fractions = odds.map((o) => (totalImplied > 0 && o > 0 ? 1 / o / totalImplied : 0));
  return { totalImplied, profitPct, isArb, fractions };
}

// The minimum decimal odds needed on one outcome to break even, given the sum
// of implied probabilities already committed on the OTHER outcomes. Anything
// longer than this locks in an arbitrage. Returns null if the others already
// sum to >= 1 (no price on this leg can rescue it).
export function breakEvenOdds(othersImpliedSum: number): number | null {
  if (othersImpliedSum >= 1) return null;
  return 1 / (1 - othersImpliedSum);
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

export interface StakeLeg {
  label: string;
  provider: string | null;
  onOdds: number;
  stake: number;
}

export interface CleanPlan {
  legs: StakeLeg[];
  totalStaked: number;
  worstProfit: number; // guaranteed (worst-case) profit
  bestProfit: number;
  profitPct: number; // worst-case profit as % of total staked
}

// Suggest total stakes NEAR a target where every leg lands on a clean multiple
// of `increment` while keeping the hedge (near) perfect — better than rounding a
// fixed bankroll, and the varied totals make bet sizing look organic.
//
// A perfect hedge pays the same on every outcome, so we anchor the shortest-odds
// leg (the biggest stake) to a clean multiple, derive the exact others from the
// implied common payout, round those to the increment, and keep the sizes whose
// rounding barely dents the hedge.
export function suggestCleanPlans(
  legs: { label: string; provider: string | null; onOdds: number }[],
  target: number,
  increment: number,
  count = 3,
): CleanPlan[] {
  if (increment <= 0 || legs.length < 2 || legs.some((l) => l.onOdds <= 0)) return [];
  const S = legs.reduce((s, l) => s + 1 / l.onOdds, 0);
  const anchorIdx = legs.reduce((mi, l, i, a) => (l.onOdds < a[mi].onOdds ? i : mi), 0);
  const oAnchor = legs[anchorIdx].onOdds;
  const targetAnchorStake = (target * (1 / oAnchor)) / S;
  const jCenter = Math.round(targetAnchorStake / increment);

  const out: CleanPlan[] = [];
  const seen = new Set<number>();
  for (let j = jCenter - 10; j <= jCenter + 10; j++) {
    if (j <= 0) continue;
    const sAnchor = j * increment;
    const payout = sAnchor * oAnchor; // common target payout for a perfect hedge
    const stakes = legs.map((l, i) =>
      i === anchorIdx ? sAnchor : Math.max(increment, Math.round(payout / l.onOdds / increment) * increment),
    );
    const totalStaked = stakes.reduce((a, b) => a + b, 0);
    if (seen.has(totalStaked)) continue;
    seen.add(totalStaked);
    const returns = stakes.map((s, i) => s * legs[i].onOdds);
    const worst = Math.min(...returns);
    const best = Math.max(...returns);
    const worstProfit = worst - totalStaked;
    if (worstProfit <= 0) continue; // must stay a genuine arb
    out.push({
      legs: legs.map((l, i) => ({ label: l.label, provider: l.provider, onOdds: l.onOdds, stake: stakes[i] })),
      totalStaked,
      worstProfit,
      bestProfit: best - totalStaked,
      profitPct: (worstProfit / totalStaked) * 100,
    });
  }
  // Closest to the target bankroll first (varying both directions), using the
  // better hedge as the tiebreak.
  out.sort(
    (a, b) =>
      Math.abs(a.totalStaked - target) - Math.abs(b.totalStaked - target) || b.profitPct - a.profitPct,
  );
  return out.slice(0, count);
}

export interface RoundedPlan {
  legs: StakeLeg[];
  totalStaked: number;
  worstReturn: number; // smallest payout across outcomes (the guaranteed one)
  worstProfit: number; // worstReturn - totalStaked; the true "locked" profit
  bestProfit: number; // largest payout - totalStaked
  stillProfitable: boolean; // worstProfit > 0 after rounding
}

// Round each leg's stake to a natural figure (e.g. nearest $5) so the bets
// don't scream "arber" to a bookmaker's risk team. Rounding unbalances the
// hedge, so the payouts diverge — we report the WORST-CASE outcome as the real
// guaranteed figure. increment <= 0 means no rounding (exact stakes).
export function roundStakePlan(
  legs: { label: string; provider: string | null; onOdds: number; stake: number }[],
  increment: number,
): RoundedPlan {
  const rounded = legs.map((l) => {
    const stake =
      increment > 0 ? Math.max(increment, Math.round(l.stake / increment) * increment) : l.stake;
    return { label: l.label, provider: l.provider, onOdds: l.onOdds, stake };
  });
  const totalStaked = rounded.reduce((a, b) => a + b.stake, 0);
  const returns = rounded.map((l) => l.stake * l.onOdds);
  const worstReturn = Math.min(...returns);
  const bestReturn = Math.max(...returns);
  return {
    legs: rounded,
    totalStaked,
    worstReturn,
    worstProfit: worstReturn - totalStaked,
    bestProfit: bestReturn - totalStaked,
    stillProfitable: worstReturn - totalStaked > 0,
  };
}
