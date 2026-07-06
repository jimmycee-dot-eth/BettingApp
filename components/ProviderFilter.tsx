"use client";

import type { Provider } from "@/lib/types";

export function ProviderFilter({
  providers,
  enabled,
  onToggle,
  onBulk,
}: {
  providers: Provider[];
  enabled: Set<string>;
  onToggle: (key: string) => void;
  onBulk: (keys: string[], on: boolean) => void;
}) {
  const books = providers.filter((p) => p.kind === "sportsbook");
  const markets = providers.filter((p) => p.kind === "prediction");

  return (
    <div className="space-y-4">
      <Group
        title="Australian sportsbooks"
        items={books}
        enabled={enabled}
        onToggle={onToggle}
        onAll={() => onBulk(books.map((b) => b.key), true)}
        onNone={() => onBulk(books.map((b) => b.key), false)}
      />
      <Group
        title="Prediction markets"
        items={markets}
        enabled={enabled}
        onToggle={onToggle}
        onAll={() => onBulk(markets.map((b) => b.key), true)}
        onNone={() => onBulk(markets.map((b) => b.key), false)}
      />
    </div>
  );
}

function Group({
  title,
  items,
  enabled,
  onToggle,
  onAll,
  onNone,
}: {
  title: string;
  items: Provider[];
  enabled: Set<string>;
  onToggle: (key: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        <div className="flex gap-1 text-[11px]">
          <button onClick={onAll} className="text-accent hover:underline">all</button>
          <span className="text-slate-600">/</span>
          <button onClick={onNone} className="text-slate-400 hover:underline">none</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((p) => {
          const on = enabled.has(p.key);
          return (
            <button
              key={p.key}
              onClick={() => onToggle(p.key)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
                on
                  ? "border-transparent bg-base-700 text-white"
                  : "border-base-700 bg-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: on ? p.color : "#475569" }}
              />
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
