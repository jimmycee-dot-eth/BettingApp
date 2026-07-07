"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventsResponse, Provider } from "@/lib/types";
import { computeArb } from "@/lib/arb";
import { ProviderFilter } from "@/components/ProviderFilter";
import { EventCard } from "@/components/EventCard";
import { fmtMoney } from "@/components/format";

type Sort = "arb" | "gap" | "hot";

export default function Home() {
  const [data, setData] = useState<EventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [bankroll, setBankroll] = useState(1000);
  const [arbOnly, setArbOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("arb");
  const [sportFilter, setSportFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EventsResponse;
      setData(json);
      setEnabled((prev) => (prev.size === 0 ? new Set(json.providers.map((p) => p.key)) : prev));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load once on mount. No polling — odds are cached server-side for 10 min
    // to conserve the free API quota; use the Refresh button to re-pull.
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providerMap = useMemo(
    () => new Map<string, Provider>((data?.providers ?? []).map((p) => [p.key, p])),
    [data],
  );

  const sports = useMemo(() => {
    const s = new Set<string>();
    (data?.events ?? []).forEach((e) => s.add(e.sport));
    return ["all", ...Array.from(s)];
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.events
      .filter((e) => sportFilter === "all" || e.sport === sportFilter)
      .map((e) => ({ event: e, arb: computeArb(e, enabled) }))
      // keep only events that still have every outcome priced under the filter
      .filter((r) => r.arb.outcomes.every((o) => o.bestDecimalOdds > 0))
      .filter((r) => (arbOnly ? r.arb.isArb : true))
      .sort((a, b) => {
        if (sort === "arb") {
          // arbs first (by profit), then smallest overround
          if (a.arb.isArb !== b.arb.isArb) return a.arb.isArb ? -1 : 1;
          if (a.arb.isArb && b.arb.isArb) return b.arb.profitPct - a.arb.profitPct;
          return a.arb.overroundPct - b.arb.overroundPct;
        }
        if (sort === "gap") return b.arb.maxGapPct - a.arb.maxGapPct;
        return (b.event.hot ?? 0) - (a.event.hot ?? 0);
      });
  }, [data, enabled, arbOnly, sort, sportFilter]);

  const arbCount = rows.filter((r) => r.arb.isArb).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎯</span>
          <h1 className="text-2xl font-bold text-white">Arb Radar</h1>
          {data && (
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                data.source === "live"
                  ? "bg-arb-soft text-arb"
                  : "bg-base-800 text-slate-400"
              }`}
            >
              {data.source === "live" ? "● live" : "demo data"}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Compare Australian sportsbook odds against live Polymarket &amp; Kalshi prices and spot
          risk-free arbitrage.
        </p>
      </header>

      {/* Controls */}
      <section className="mb-6 space-y-5 rounded-xl border border-base-700 bg-base-900 p-4">
        <ProviderFilter
          providers={data?.providers ?? []}
          enabled={enabled}
          onToggle={(k) =>
            setEnabled((prev) => {
              const n = new Set(prev);
              n.has(k) ? n.delete(k) : n.add(k);
              return n;
            })
          }
          onBulk={(keys, on) =>
            setEnabled((prev) => {
              const n = new Set(prev);
              keys.forEach((k) => (on ? n.add(k) : n.delete(k)));
              return n;
            })
          }
        />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-base-800 pt-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate-400">Bankroll</span>
            <div className="flex items-center rounded-lg border border-base-700 bg-base-950 px-2">
              <span className="text-slate-500">$</span>
              <input
                type="number"
                min={1}
                value={bankroll}
                onChange={(e) => setBankroll(Math.max(1, Number(e.target.value) || 0))}
                className="w-24 bg-transparent py-1.5 text-white outline-none"
              />
            </div>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-400">Sport</span>
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="rounded-lg border border-base-700 bg-base-950 px-2 py-1.5 text-white outline-none"
            >
              {sports.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All sports" : s}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-400">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-base-700 bg-base-950 px-2 py-1.5 text-white outline-none"
            >
              <option value="arb">Best arbitrage</option>
              <option value="gap">Biggest price gap</option>
              <option value="hot">Hottest</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={arbOnly}
              onChange={(e) => setArbOnly(e.target.checked)}
              className="h-4 w-4 accent-arb"
            />
            <span className="text-slate-300">Arbs only</span>
          </label>

          <button
            onClick={load}
            className="ml-auto rounded-lg border border-base-700 px-3 py-1.5 text-slate-300 hover:bg-base-800"
          >
            ↻ Refresh
          </button>
        </div>
      </section>

      {/* Status line */}
      <div className="mb-4 flex items-center justify-between text-sm">
        <div className="text-slate-400">
          {loading && !data ? (
            "Loading events…"
          ) : (
            <>
              <span className="font-semibold text-white">{rows.length}</span> events
              {arbCount > 0 && (
                <span className="ml-2 rounded-full bg-arb-soft px-2 py-0.5 text-xs font-semibold text-arb">
                  {arbCount} arb{arbCount > 1 ? "s" : ""} live
                </span>
              )}
            </>
          )}
        </div>
        {data && (
          <span className="text-xs text-slate-600">
            updated {new Date(data.generatedAt).toLocaleTimeString("en-AU")}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          Failed to load: {error}
        </div>
      )}

      {/* Events */}
      <div className="space-y-3">
        {rows.map((r) => (
          <EventCard
            key={r.event.id}
            event={r.event}
            arb={r.arb}
            bankroll={bankroll}
            providerMap={providerMap}
            enabled={enabled}
          />
        ))}
        {!loading && rows.length === 0 && (
          <div className="rounded-xl border border-base-700 bg-base-900 p-8 text-center text-slate-400">
            No events match your filters. Try enabling more providers or turning off “Arbs only”.
          </div>
        )}
      </div>

      {/* Notes / footer */}
      {data?.notes?.length ? (
        <details className="mt-8 text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">Data source notes</summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <footer className="mt-8 border-t border-base-800 pt-4 text-xs text-slate-600">
        Odds are indicative and move fast — always confirm at the book before staking.{" "}
        {fmtMoney(bankroll)} bankroll used for stake-plan maths. Gamble responsibly.
      </footer>
    </main>
  );
}
