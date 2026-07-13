"use client";

import { useState } from "react";
import type { MarketEvent, ArbResult, Provider } from "@/lib/types";
import { stakePlan, bestValueGap, roundStakePlan, suggestCleanPlans } from "@/lib/arb";
import { ArbCalculator } from "./ArbCalculator";
import { fmtOdds, fmtPct, fmtMoney, fmtCents, timeUntil } from "./format";

const ROUND_OPTIONS = [0, 1, 5, 10, 25, 50];

export function EventCard({
  event,
  arb,
  bankroll,
  providerMap,
  enabled,
}: {
  event: MarketEvent;
  arb: ArbResult;
  bankroll: number;
  providerMap: Map<string, Provider>;
  enabled: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [roundInc, setRoundInc] = useState(0); // 0 = exact stakes
  const isFutures = event.category === "futures";
  const plan = arb.isArb ? stakePlan(arb, bankroll) : [];
  const rounded = arb.isArb ? roundStakePlan(plan, roundInc) : null;
  const suggestions =
    arb.isArb && roundInc > 0 && rounded
      ? suggestCleanPlans(
          plan.map((p) => ({ label: p.label, provider: p.provider, onOdds: p.onOdds })),
          bankroll,
          roundInc,
          4,
        )
          // drop the one identical to the exact-bankroll rounded plan shown above
          .filter((s) => s.totalStaked !== rounded.totalStaked)
          .slice(0, 3)
      : [];

  const predictionKeys = new Set(
    [...providerMap.values()].filter((p) => p.kind === "prediction").map((p) => p.key),
  );
  const valueGap = isFutures ? bestValueGap(event, enabled, predictionKeys) : null;

  // Futures can have many competitors — show favourites (shortest odds) first
  // and cap the grid; the full field lives in the expandable table.
  const gridOutcomes = isFutures
    ? [...arb.outcomes].filter((o) => o.bestDecimalOdds > 0).sort((a, b) => a.bestDecimalOdds - b.bestDecimalOdds).slice(0, 6)
    : arb.outcomes;
  const hiddenCount = isFutures ? arb.outcomes.filter((o) => o.bestDecimalOdds > 0).length - gridOutcomes.length : 0;

  return (
    <div
      className={`rounded-xl border bg-base-900 transition ${
        arb.isArb ? "border-arb/60 shadow-[0_0_0_1px_rgba(34,197,94,0.25)]" : "border-base-700"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-base-800 px-1.5 py-0.5 font-medium text-slate-300">
                {event.sport}
              </span>
              {event.league && <span>{event.league}</span>}
              <span>·</span>
              <span>{isFutures ? "futures" : timeUntil(event.commenceTime)}</span>
            </div>
            <h3 className="mt-1 truncate text-base font-semibold text-white">{event.title}</h3>
          </div>
          {isFutures ? <ValueBadge gap={valueGap} /> : <ArbBadge arb={arb} />}
        </div>

        {/* Best price per outcome */}
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(gridOutcomes.length, 3)}, minmax(0, 1fr))` }}>
          {gridOutcomes.map((o) => {
            const prov = o.bestProviderKey ? providerMap.get(o.bestProviderKey) : undefined;
            return (
              <div key={o.outcomeKey} className="rounded-lg bg-base-850 p-3">
                <div className="truncate text-sm text-slate-300">{o.label}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-white">
                    {fmtOdds(o.bestDecimalOdds)}
                  </span>
                  <span className="text-xs text-slate-500">{fmtPct(o.impliedProb * 100, 0)}</span>
                </div>
                {prov && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: prov.color }} />
                    best @ {prov.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {hiddenCount > 0 && (
          <div className="mt-2 text-xs text-slate-500">+{hiddenCount} more competitors — see full table</div>
        )}

        {/* Summary row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {isFutures ? (
            <>
              <Metric label="Competitors" value={String(arb.outcomes.filter((o) => o.bestDecimalOdds > 0).length)} />
              <Metric
                label="Best book↔prediction gap"
                value={valueGap ? fmtPct(valueGap.gapPct) : "—"}
                hint="largest price difference between a bookie and a prediction market on one competitor"
              />
            </>
          ) : (
            <>
              <Metric
                label="Market total"
                value={fmtPct(arb.totalImpliedProb * 100)}
                hint={arb.isArb ? "under 100% = free money" : "over 100% = house edge"}
                good={arb.isArb}
              />
              <Metric
                label={arb.isArb ? "Guaranteed profit" : "House edge"}
                value={arb.isArb ? fmtPct(arb.profitPct) : fmtPct(arb.overroundPct)}
                good={arb.isArb}
              />
              <Metric label="Best price gap" value={fmtPct(arb.maxGapPct)} />
            </>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto text-accent hover:underline"
          >
            {open ? "hide all odds" : isFutures ? "all odds" : "all odds & stake plan"}
          </button>
        </div>

        {/* Futures value strip */}
        {isFutures && valueGap && (
          <ValueStrip gap={valueGap} providerMap={providerMap} event={event} enabled={enabled} predictionKeys={predictionKeys} />
        )}

        {/* Arb call-to-action strip (matches only) */}
        {arb.isArb && rounded && (
          <div
            className={`mt-3 rounded-lg p-3 text-sm ${
              roundInc > 0 && !rounded.stillProfitable ? "bg-amber-950/40" : "bg-arb-soft"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={roundInc > 0 && !rounded.stillProfitable ? "font-semibold text-amber-300" : "font-semibold text-arb"}>
                {plan.length}-way arb across {venueCount(plan)} venue{venueCount(plan) > 1 ? "s" : ""}:{" "}
                stake {fmtMoney(rounded.totalStaked)} → {roundInc > 0 ? "guaranteed ≥ " : "guaranteed "}
                {fmtMoney(rounded.totalStaked + rounded.worstProfit)}
                <span className={roundInc > 0 && !rounded.stillProfitable ? "text-amber-300/80" : "text-arb/80"}>
                  {" "}
                  ({rounded.worstProfit >= 0 ? "+" : ""}
                  {fmtMoney(rounded.worstProfit)})
                </span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>Round to</span>
                <select
                  value={roundInc}
                  onChange={(e) => setRoundInc(Number(e.target.value))}
                  className="rounded border border-base-700 bg-base-950 px-1.5 py-1 text-white outline-none"
                >
                  {ROUND_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v === 0 ? "exact" : `$${v}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 space-y-1">
              {rounded.legs.map((p, i) => {
                const prov = p.provider ? providerMap.get(p.provider) : undefined;
                return (
                  <div key={i} className="flex items-center gap-2 text-slate-200">
                    <span className="text-[11px] font-semibold text-arb/70">Leg {i + 1}</span>
                    <span className="font-mono font-semibold text-white">{fmtMoney(p.stake)}</span>
                    <span>on</span>
                    <span className="text-white">{p.label}</span>
                    <span className="text-slate-400">@ {fmtOdds(p.onOdds)}</span>
                    {prov && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: prov.color }} />
                        {prov.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {roundInc > 0 && (
              <div className="mt-2 text-xs text-slate-400">
                {rounded.stillProfitable ? (
                  <>
                    Rounded to ${roundInc} — still profitable in every outcome (worst{" "}
                    {fmtMoney(rounded.worstProfit)}, best {fmtMoney(rounded.bestProfit)}). Rounding
                    unbalances the hedge, so returns vary slightly by result.
                  </>
                ) : (
                  <span className="text-amber-300">
                    ⚠ Rounding to ${roundInc} breaks the arb — worst case {fmtMoney(rounded.worstProfit)}.
                    Use a smaller increment or a bigger bankroll.
                  </span>
                )}
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="mt-3 border-t border-arb/20 pt-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Cleaner sizes near {fmtMoney(bankroll)} — all legs on ${roundInc}, hedge intact
                </div>
                <div className="space-y-1">
                  {suggestions.map((s, si) => (
                    <div key={si} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono font-semibold text-white">{fmtMoney(s.totalStaked)}</span>
                      <span className="text-slate-500">=</span>
                      <span className="text-slate-300">
                        {s.legs.map((l, li) => (
                          <span key={li}>
                            {li > 0 && <span className="text-slate-600"> + </span>}
                            <span className="font-mono text-slate-200">{fmtMoney(l.stake)}</span>{" "}
                            {l.label}
                          </span>
                        ))}
                      </span>
                      <span className="text-slate-500">→</span>
                      <span className="font-mono text-arb">
                        +{fmtMoney(s.worstProfit)} ({fmtPct(s.profitPct)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {open && (
        <>
          <OddsTable event={event} arb={arb} providerMap={providerMap} enabled={enabled} />
          {!isFutures && (
            <ArbCalculator event={event} arb={arb} bankroll={bankroll} providerMap={providerMap} />
          )}
        </>
      )}
    </div>
  );
}

// How many distinct providers ("locations") the optimal arb legs span.
function venueCount(plan: { provider: string | null }[]): number {
  return new Set(plan.map((p) => p.provider).filter(Boolean)).size;
}

function ValueBadge({ gap }: { gap: ReturnType<typeof bestValueGap> }) {
  if (!gap) {
    return (
      <div className="shrink-0 rounded-lg bg-base-800 px-3 py-1.5 text-center">
        <div className="text-[10px] font-semibold uppercase leading-none text-slate-500">Futures</div>
        <div className="font-mono text-sm font-bold leading-tight text-slate-400">book only</div>
      </div>
    );
  }
  return (
    <div className="shrink-0 rounded-lg bg-base-800 px-3 py-1.5 text-center">
      <div className="text-[10px] font-semibold uppercase leading-none text-accent">Value</div>
      <div className="font-mono text-lg font-bold leading-tight text-accent">{fmtPct(gap.gapPct, 0)}</div>
    </div>
  );
}

function ValueStrip({
  gap,
  providerMap,
  event,
  enabled,
  predictionKeys,
}: {
  gap: NonNullable<ReturnType<typeof bestValueGap>>;
  providerMap: Map<string, Provider>;
  event: MarketEvent;
  enabled: Set<string>;
  predictionKeys: Set<string>;
}) {
  // Which provider offers the better (higher) price on the value competitor?
  const outcome = event.outcomes.find((o) => o.label === gap.label);
  let bestProv: Provider | undefined;
  let bestOdds = 0;
  const wantPrediction = gap.betterSide === "prediction";
  for (const q of outcome?.quotes ?? []) {
    if (!enabled.has(q.providerKey)) continue;
    const isPred = predictionKeys.has(q.providerKey);
    if (isPred !== wantPrediction) continue;
    if (q.decimalOdds > bestOdds) {
      bestOdds = q.decimalOdds;
      bestProv = providerMap.get(q.providerKey);
    }
  }
  const otherOdds = wantPrediction ? gap.bookOdds : gap.predOdds;
  return (
    <div className="mt-3 rounded-lg bg-base-850 p-3 text-sm">
      <span className="font-semibold text-accent">Best value: </span>
      <span className="text-slate-200">
        back <span className="text-white">{gap.label}</span> @{" "}
        <span className="font-mono font-semibold text-white">{fmtOdds(bestOdds)}</span>
        {bestProv && <span className="text-slate-400"> ({bestProv.name})</span>} —{" "}
        <span className="text-accent">{fmtPct(gap.gapPct, 0)} longer</span> than{" "}
        {wantPrediction ? "the best book's" : "the prediction market's"} {fmtOdds(otherOdds)}
      </span>
    </div>
  );
}

function ArbBadge({ arb }: { arb: ArbResult }) {
  if (arb.isArb) {
    return (
      <div className="shrink-0 rounded-lg bg-arb px-3 py-1.5 text-center">
        <div className="text-[10px] font-semibold uppercase leading-none text-green-950">Arb</div>
        <div className="font-mono text-lg font-bold leading-tight text-green-950">
          +{arb.profitPct.toFixed(2)}%
        </div>
      </div>
    );
  }
  const close = arb.overroundPct < 3;
  return (
    <div className="shrink-0 rounded-lg bg-base-800 px-3 py-1.5 text-center">
      <div className="text-[10px] font-semibold uppercase leading-none text-slate-500">Edge</div>
      <div className={`font-mono text-lg font-bold leading-tight ${close ? "text-amber-400" : "text-slate-400"}`}>
        {arb.overroundPct >= 0 ? "-" : "+"}
        {Math.abs(arb.overroundPct).toFixed(2)}%
      </div>
    </div>
  );
}

function Metric({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) {
  return (
    <div className="flex items-center gap-1.5" title={hint}>
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${good ? "text-arb" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}

function OddsTable({
  event,
  arb,
  providerMap,
  enabled,
}: {
  event: MarketEvent;
  arb: ArbResult;
  providerMap: Map<string, Provider>;
  enabled: Set<string>;
}) {
  // Union of providers that quoted at least one outcome (respecting the filter).
  const providerKeys = Array.from(
    new Set(
      event.outcomes.flatMap((o) =>
        o.quotes.filter((q) => enabled.has(q.providerKey)).map((q) => q.providerKey),
      ),
    ),
  );

  const bestByOutcome = new Map(arb.outcomes.map((o) => [o.outcomeKey, o.bestProviderKey]));

  return (
    <div className="overflow-x-auto border-t border-base-700 p-4">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-2 pr-4 font-medium">Provider</th>
            {event.outcomes.map((o) => (
              <th key={o.key} className="pb-2 pr-4 text-right font-medium">
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {providerKeys.map((pk) => {
            const prov = providerMap.get(pk);
            return (
              <tr key={pk} className="border-t border-base-800">
                <td className="py-1.5 pr-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: prov?.color ?? "#64748b" }} />
                    {prov?.name ?? pk}
                    {prov?.kind === "prediction" && (
                      <span className="rounded bg-base-800 px-1 text-[10px] text-slate-400">pred</span>
                    )}
                  </span>
                </td>
                {event.outcomes.map((o) => {
                  const q = o.quotes.find((x) => x.providerKey === pk);
                  const isBest = bestByOutcome.get(o.key) === pk;
                  return (
                    <td key={o.key} className="py-1.5 pr-4 text-right font-mono">
                      {q ? (
                        <span className={isBest ? "font-bold text-arb" : "text-slate-300"}>
                          {fmtOdds(q.decimalOdds)}
                          {q.impliedProb != null && (
                            <span className="ml-1 text-[10px] text-slate-500">{fmtCents(q.impliedProb)}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
