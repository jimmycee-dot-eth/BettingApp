"use client";

import { useState } from "react";
import type { MarketEvent, ArbResult, Provider } from "@/lib/types";
import { arbFromOdds, breakEvenOdds } from "@/lib/arb";
import { fmtOdds, fmtPct, fmtMoney } from "./format";

// Target-odds shopping list + what-if simulator.
//
// For each outcome we show the best odds our app found and the odds you'd need
// to obtain (given the other legs' current effective odds) to reach a profit.
// Enter odds you can get from any source and the whole trade re-simulates.
export function ArbCalculator({
  event,
  arb,
  bankroll,
  providerMap,
}: {
  event: MarketEvent;
  arb: ArbResult;
  bankroll: number;
  providerMap: Map<string, Provider>;
}) {
  // Raw text inputs keyed by outcome; empty = use our best indexed price.
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const rows = arb.outcomes.map((o) => {
    const typed = parseFloat(inputs[o.outcomeKey] ?? "");
    const userOdds = Number.isFinite(typed) && typed > 1 ? typed : 0;
    // You'd place each leg wherever it pays most: the better of your price and ours.
    const effective = Math.max(o.bestDecimalOdds, userOdds);
    return { ...o, userOdds, effective, usingUser: userOdds > 0 && userOdds >= o.bestDecimalOdds };
  });

  const effectiveOdds = rows.map((r) => r.effective);
  const sim = arbFromOdds(effectiveOdds);

  // Per-leg break-even target, given the OTHER legs' current effective odds.
  const targets = rows.map((r) => {
    const othersSum = rows
      .filter((x) => x.outcomeKey !== r.outcomeKey)
      .reduce((s, x) => s + (x.effective > 0 ? 1 / x.effective : 0), 0);
    return breakEvenOdds(othersSum);
  });

  return (
    <div className="border-t border-base-700 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-white">Target odds &amp; what-if calculator</h4>
        <span className="text-xs text-slate-500">
          enter odds from any source to simulate
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 pr-3 font-medium">Outcome</th>
              <th className="pb-2 pr-3 text-right font-medium">Best found</th>
              <th className="pb-2 pr-3 text-right font-medium" title="Odds needed on this leg to profit, given the others">
                Target to profit
              </th>
              <th className="pb-2 pr-3 text-right font-medium">Your odds</th>
              <th className="pb-2 text-right font-medium">Using</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const prov = r.bestProviderKey ? providerMap.get(r.bestProviderKey) : undefined;
              const target = targets[i];
              const targetMet = target != null && r.effective >= target;
              return (
                <tr key={r.outcomeKey} className="border-t border-base-800">
                  <td className="py-2 pr-3 text-slate-200">{r.label}</td>
                  <td className="py-2 pr-3 text-right font-mono text-slate-300">
                    {fmtOdds(r.bestDecimalOdds)}
                    {prov && <span className="ml-1 text-[10px] text-slate-500">{prov.name}</span>}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {target == null ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <span className={targetMet ? "text-arb" : "text-amber-400"}>
                        ≥ {fmtOdds(target)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <input
                      inputMode="decimal"
                      placeholder={fmtOdds(r.bestDecimalOdds)}
                      value={inputs[r.outcomeKey] ?? ""}
                      onChange={(e) =>
                        setInputs((prev) => ({ ...prev, [r.outcomeKey]: e.target.value }))
                      }
                      className="w-20 rounded border border-base-700 bg-base-950 px-2 py-1 text-right font-mono text-white outline-none focus:border-accent"
                    />
                  </td>
                  <td className="py-2 text-right font-mono">
                    <span className={r.usingUser ? "text-accent" : "text-slate-400"}>
                      {fmtOdds(r.effective)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Simulated result */}
      <div
        className={`mt-3 rounded-lg p-3 text-sm ${sim.isArb ? "bg-arb-soft" : "bg-base-850"}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Stat label="Combined book" value={fmtPct(sim.totalImplied * 100)} good={sim.isArb} />
          {sim.isArb ? (
            <>
              <Stat label="Guaranteed profit" value={`+${fmtPct(sim.profitPct)}`} good />
              <Stat
                label={`Return on ${fmtMoney(bankroll)}`}
                value={`${fmtMoney(bankroll * (1 + sim.profitPct / 100))} (+${fmtMoney(bankroll * (sim.profitPct / 100))})`}
                good
              />
            </>
          ) : (
            <span className="text-xs text-slate-400">
              Not yet profitable — beat a target price above to flip it green.
            </span>
          )}
        </div>

        {sim.isArb && (
          <div className="mt-2 space-y-1">
            {rows.map((r, i) => (
              <div key={r.outcomeKey} className="flex items-center gap-2 text-slate-200">
                <span className="text-[11px] font-semibold text-arb/70">Leg {i + 1}</span>
                <span className="font-mono font-semibold text-white">
                  {fmtMoney(bankroll * sim.fractions[i])}
                </span>
                <span>on</span>
                <span className="text-white">{r.label}</span>
                <span className="text-slate-400">@ {fmtOdds(r.effective)}</span>
                <span className="text-[11px] text-slate-500">
                  {r.usingUser
                    ? "your price"
                    : r.bestProviderKey
                      ? providerMap.get(r.bestProviderKey)?.name
                      : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${good ? "text-arb" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}
