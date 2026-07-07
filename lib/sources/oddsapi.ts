import type { MarketEvent, Outcome, Quote } from "../types";

// The Odds API (https://the-odds-api.com) — Australian bookmaker odds.
// Free tier: 500 requests/month. Set ODDS_API_KEY in the environment.
//
// We pull a handful of popular AU-relevant sports, request the "au" region and
// the head-to-head (moneyline) market in decimal format, and normalise into
// our MarketEvent shape.

const BASE = "https://api.the-odds-api.com/v4";

// Sports we care about for AU users. The Odds API sport keys.
const SPORT_KEYS: { key: string; sport: string; league: string }[] = [
  { key: "aussierules_afl", sport: "AFL", league: "AFL" },
  { key: "rugbyleague_nrl", sport: "NRL", league: "NRL" },
  { key: "basketball_nba", sport: "NBA", league: "NBA" },
  { key: "soccer_epl", sport: "Soccer", league: "EPL" },
  { key: "soccer_australia_aleague", sport: "Soccer", league: "A-League" },
  { key: "tennis_atp_wimbledon", sport: "Tennis", league: "ATP" },
];

interface OddsApiOutcome { name: string; price: number }
interface OddsApiMarket { key: string; outcomes: OddsApiOutcome[] }
interface OddsApiBookmaker { key: string; title: string; markets: OddsApiMarket[] }
interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

function outcomeKeyFor(name: string, home: string, away: string): string {
  if (name === home) return "home";
  if (name === away) return "away";
  if (name.toLowerCase() === "draw") return "draw";
  return name.toLowerCase().replace(/\s+/g, "-");
}

export async function fetchOddsApi(): Promise<{ events: MarketEvent[]; notes: string[] }> {
  const key = process.env.ODDS_API_KEY;
  const notes: string[] = [];
  if (!key) {
    return { events: [], notes: ["ODDS_API_KEY not set — sportsbook odds are mocked."] };
  }

  const all: MarketEvent[] = [];
  let quotaRemaining: string | null = null;
  let quotaUsed: string | null = null;
  for (const s of SPORT_KEYS) {
    try {
      const url =
        `${BASE}/sports/${s.key}/odds?apiKey=${key}` +
        `&regions=au&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
      // Cache each sport's odds for 10 minutes to conserve the free-tier quota.
      const res = await fetch(url, { next: { revalidate: 600 } });
      // The Odds API reports remaining/used credits on every response header.
      quotaRemaining = res.headers.get("x-requests-remaining") ?? quotaRemaining;
      quotaUsed = res.headers.get("x-requests-used") ?? quotaUsed;
      if (!res.ok) {
        notes.push(`Odds API ${s.key}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as OddsApiEvent[];
      for (const e of data) {
        const outcomesMap = new Map<string, Outcome>();
        for (const bm of e.bookmakers) {
          const h2h = bm.markets.find((m) => m.key === "h2h");
          if (!h2h) continue;
          for (const o of h2h.outcomes) {
            const ok = outcomeKeyFor(o.name, e.home_team, e.away_team);
            if (!outcomesMap.has(ok)) {
              outcomesMap.set(ok, { key: ok, label: o.name, quotes: [] });
            }
            const quote: Quote = { providerKey: bm.key, decimalOdds: o.price };
            outcomesMap.get(ok)!.quotes.push(quote);
          }
        }
        const outcomes = [...outcomesMap.values()];
        if (outcomes.length === 0) continue;
        all.push({
          id: e.id,
          sport: s.sport,
          sportKey: s.key,
          league: s.league,
          title: `${e.home_team} vs ${e.away_team}`,
          commenceTime: e.commence_time,
          outcomes,
          hasSportsbook: true,
          hasPrediction: false,
          hot: e.bookmakers.length, // more books quoting => hotter
        });
      }
    } catch (err) {
      notes.push(`Odds API ${s.key}: ${(err as Error).message}`);
    }
  }
  if (all.length > 0) notes.push(`Odds API: ${all.length} live sportsbook events.`);
  if (quotaRemaining != null) {
    notes.push(
      `Odds API quota: ${quotaRemaining} credits remaining` +
        (quotaUsed != null ? ` (${quotaUsed} used this month).` : "."),
    );
  }
  return { events: all, notes };
}
