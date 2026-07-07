import type { PredictionQuote } from "../match";

// Kalshi public markets API — read-only market data needs no auth.
// yes_bid / yes_ask are in cents (0..100). We use the mid price to derive an
// implied probability, then decimal odds via 1/prob.

const BASE = "https://api.elections.kalshi.com/trade-api/v2";

interface KalshiMarket {
  ticker: string;
  title: string;
  yes_bid?: number; // cents
  yes_ask?: number; // cents
  status?: string;
  volume?: number;
}

export async function fetchKalshi(): Promise<{ quotes: PredictionQuote[]; notes: string[] }> {
  try {
    const url = `${BASE}/markets?limit=200&status=open`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) return { quotes: [], notes: [`Kalshi: HTTP ${res.status}`] };
    const data = (await res.json()) as { markets?: KalshiMarket[] };
    const markets = data.markets ?? [];
    const quotes: PredictionQuote[] = [];
    for (const m of markets) {
      const bid = m.yes_bid ?? 0;
      const ask = m.yes_ask ?? 0;
      if (bid <= 0 && ask <= 0) continue;
      const mid = ((bid || ask) + (ask || bid)) / 2 / 100; // -> probability 0..1
      if (mid <= 0 || mid >= 1) continue;
      const yesOdds = +(1 / mid).toFixed(3);
      const noOdds = +(1 / (1 - mid)).toFixed(3);
      quotes.push({
        provider: "kalshi",
        title: m.title,
        outcomes: [
          { label: "Yes", price: mid, decimalOdds: yesOdds },
          { label: "No", price: 1 - mid, decimalOdds: noOdds },
        ],
        volume: m.volume ?? 0,
      });
    }
    return { quotes, notes: [`Kalshi: ${quotes.length} live markets.`] };
  } catch (err) {
    return { quotes: [], notes: [`Kalshi: ${(err as Error).message}`] };
  }
}
