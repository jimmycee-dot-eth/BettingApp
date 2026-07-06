"use client";

import { useState } from "react";
import type { MarketEvent, ArbResult, Provider } from "@/lib/types";
import { stakePlan } from "@/lib/arb";
import { fmtOdds, fmtPct, fmtMoney, fmtCents, timeUntil } from "./format";

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
  const plan = arb.isArb ? stakePlan(arb, bankroll) : [];

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
              <span>{timeUntil(event.commenceTime)}</span>
            </div>
            <h3 className="mt-1 truncate text-base font-semibold text-white">{event.title}</h3>
          </div>
          <ArbBadge arb={arb} />
        </div>

        {/* Best price per outcome */}
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(event.outcomes.length, 3)}, minmax(0, 1fr))` }}>
          {arb.outcomes.map((o) => {
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

        {/* Summary row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto text-accent hover:underline"
          >
            {open ? "hide all odds" : "all odds & stake plan"}
          </button>
        </div>

        {/* Arb call-to-action strip */}
        {arb.isArb && (
          <div className="mt-3 rounded-lg bg-arb-soft p-3 text-sm">
            <div className="font-semibold text-arb">
              Arbitrage: stake {fmtMoney(bankroll)} → guaranteed {fmtMoney(bankroll * (1 + arb.profitPct / 100))} back
              <span className="text-arb/80"> (+{fmtMoney(bankroll * (arb.profitPct / 100))})</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {plan.map((p) => {
                const prov = p.provider ? providerMap.get(p.provider) : undefined;
                return (
                  <div key={p.outcomeKey} className="text-slate-200">
                    <span className="font-mono font-semibold text-white">{fmtMoney(p.stake)}</span>{" "}
                    on <span className="text-white">{p.label}</span> @ {fmtOdds(p.onOdds)}
                    {prov && <span className="text-slate-400"> ({prov.name})</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {open && (
        <OddsTable event={event} arb={arb} providerMap={providerMap} enabled={enabled} />
      )}
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
