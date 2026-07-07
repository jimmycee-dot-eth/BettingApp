import type { PredictionQuote } from "../match";

// Polymarket Gamma API — public, no key required.
// We pull hot (high-volume) open markets. Each binary market gives us YES/NO
// prices (0..1) which convert to decimal odds via 1/price.

const GAMMA = "https://gamma-api.polymarket.com";

interface GammaMarket {
  question: string;
  outcomes?: string; // JSON string array, e.g. "[\"Yes\", \"No\"]"
  outcomePrices?: string; // JSON string array, e.g. "[\"0.62\", \"0.38\"]"
  closed?: boolean;
  volume?: string | number;
  slug?: string;
}

export async function fetchPolymarket(): Promise<{ quotes: PredictionQuote[]; notes: string[] }> {
  const notes: string[] = [];
  try {
    const url = `${GAMMA}/markets?closed=false&order=volume&ascending=false&limit=120`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) return { quotes: [], notes: [`Polymarket: HTTP ${res.status}`] };
    const data = (await res.json()) as GammaMarket[];
    const quotes: PredictionQuote[] = [];
    for (const m of data) {
      if (m.closed) continue;
      let outcomes: string[] = [];
      let prices: number[] = [];
      try {
        outcomes = m.outcomes ? JSON.parse(m.outcomes) : [];
        prices = m.outcomePrices ? (JSON.parse(m.outcomePrices) as string[]).map(Number) : [];
      } catch {
        continue;
      }
      if (outcomes.length !== prices.length || outcomes.length === 0) continue;
      const volume = typeof m.volume === "string" ? Number(m.volume) : m.volume ?? 0;
      quotes.push({
        provider: "polymarket",
        title: m.question,
        outcomes: outcomes.map((label, i) => ({
          label,
          price: prices[i],
          decimalOdds: prices[i] > 0 ? +(1 / prices[i]).toFixed(3) : 0,
        })),
        volume,
      });
    }
    notes.push(`Polymarket: ${quotes.length} live markets.`);
    return { quotes, notes };
  } catch (err) {
    return { quotes: [], notes: [`Polymarket: ${(err as Error).message}`] };
  }
}
