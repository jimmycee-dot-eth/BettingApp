import type { EventsResponse, MarketEvent } from "./types";
import { ALL_PROVIDERS } from "./providers";
import { mockEvents } from "./sources/mock";
import { fetchOddsApi } from "./sources/oddsapi";
import { fetchPolymarket } from "./sources/polymarket";
import { fetchKalshi } from "./sources/kalshi";
import { attachPredictions, type PredictionQuote } from "./match";

// In-memory cache so repeated page loads / manual refreshes within the TTL are
// served without spending any Odds API credits. The route is force-dynamic, so
// this is our primary quota guard (a warm serverless instance keeps it hot).
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache: { at: number; data: EventsResponse } | null = null;

// Builds the unified event list from whatever sources are available.
//
// - No ODDS_API_KEY  -> pure mock data (fully functional demo).
// - With ODDS_API_KEY -> live AU sportsbook events, enriched best-effort with
//   live Polymarket/Kalshi quotes matched onto them by title.
export async function buildEvents(): Promise<EventsResponse> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    const ageSec = Math.round((Date.now() - cache.at) / 1000);
    return { ...cache.data, notes: [...cache.data.notes, `Served from cache (${ageSec}s old).`] };
  }

  const data = await buildFresh();
  cache = { at: Date.now(), data };
  return data;
}

async function buildFresh(): Promise<EventsResponse> {
  const notes: string[] = [];
  const hasKey = !!process.env.ODDS_API_KEY;

  if (!hasKey) {
    return {
      source: "mock",
      generatedAt: new Date().toISOString(),
      notes: [
        "Demo mode: set ODDS_API_KEY (free at the-odds-api.com) to pull live AU sportsbook odds.",
        "Prices below are illustrative but the arbitrage maths is real.",
      ],
      providers: ALL_PROVIDERS,
      events: sortHot(mockEvents()),
    };
  }

  // Live path — fetch all three sources in parallel; degrade gracefully.
  const [odds, poly, kalshi] = await Promise.all([
    fetchOddsApi(),
    fetchPolymarket(),
    fetchKalshi(),
  ]);
  notes.push(...odds.notes, ...poly.notes, ...kalshi.notes);

  let events: MarketEvent[] = odds.events;

  const predictions: PredictionQuote[] = [...poly.quotes, ...kalshi.quotes];
  if (events.length > 0 && predictions.length > 0) {
    const n = attachPredictions(events, predictions);
    notes.push(`Matched ${n} prediction-market quote sets onto sportsbook events.`);
  }

  // If live sportsbook came back empty (bad key, quota, off-season), fall back
  // to mock so the UI is never blank.
  if (events.length === 0) {
    notes.push("No live sportsbook events returned — showing demo data.");
    return {
      source: "mock",
      generatedAt: new Date().toISOString(),
      notes,
      providers: ALL_PROVIDERS,
      events: sortHot(mockEvents()),
    };
  }

  return {
    source: "live",
    generatedAt: new Date().toISOString(),
    notes,
    providers: ALL_PROVIDERS,
    events: sortHot(events),
  };
}

function sortHot(events: MarketEvent[]): MarketEvent[] {
  return [...events].sort((a, b) => (b.hot ?? 0) - (a.hot ?? 0));
}
