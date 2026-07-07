import type { MarketEvent, Outcome, Quote } from "../types";

// The Odds API (https://the-odds-api.com) — Australian bookmaker odds.
// Free tier: 500 requests/month. Set ODDS_API_KEY in the environment.
//
// Rather than guessing sport keys (which silently 404 when a competition is
// off-season or renamed), we first hit the FREE /sports endpoint to discover
// which sports are actually live right now, then only fetch odds for the ones
// we care about. This makes e.g. the World Cup appear automatically under
// whatever key it is currently live as, and avoids wasting quota on 404s.

const BASE = "https://api.the-odds-api.com/v4";

// Curated AU-relevant head-to-head competitions. Fetched only when active.
const MATCH_ALLOW: Record<string, { sport: string; league: string }> = {
  aussierules_afl: { sport: "AFL", league: "AFL" },
  rugbyleague_nrl: { sport: "NRL", league: "NRL" },
  rugbyunion_super_rugby: { sport: "Rugby", league: "Super Rugby" },
  basketball_nba: { sport: "Basketball", league: "NBA" },
  basketball_nbl: { sport: "Basketball", league: "NBL" },
  soccer_epl: { sport: "Soccer", league: "EPL" },
  soccer_australia_aleague: { sport: "Soccer", league: "A-League" },
  soccer_uefa_champs_league: { sport: "Soccer", league: "UCL" },
  soccer_uefa_european_championship: { sport: "Soccer", league: "Euros" },
  cricket_test_match: { sport: "Cricket", league: "Test" },
  cricket_big_bash: { sport: "Cricket", league: "BBL" },
};

// Map an Odds API "group" to our short sport label (for dynamically-added keys).
function groupToSport(group: string): string {
  const g = group.toLowerCase();
  if (g.includes("aussie")) return "AFL";
  if (g.includes("rugby league")) return "NRL";
  if (g.includes("rugby")) return "Rugby";
  if (g.includes("soccer")) return "Soccer";
  if (g.includes("basketball")) return "Basketball";
  if (g.includes("tennis")) return "Tennis";
  if (g.includes("cricket")) return "Cricket";
  if (g.includes("american")) return "NFL";
  if (g.includes("baseball")) return "Baseball";
  if (g.includes("hockey")) return "Hockey";
  return group;
}

interface SportInfo {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights: boolean;
}

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

// The /sports endpoint is free (does not count against the quota).
export async function fetchActiveSports(): Promise<SportInfo[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${BASE}/sports?apiKey=${key}`, { next: { revalidate: 600 } });
    if (!res.ok) return [];
    return (await res.json()) as SportInfo[];
  } catch {
    return [];
  }
}

interface FetchTarget { key: string; sport: string; league: string }

// Decide which head-to-head competitions to pull, from the live sports list.
function selectMatchTargets(active: SportInfo[]): FetchTarget[] {
  const targets: FetchTarget[] = [];
  const seen = new Set<string>();
  for (const s of active) {
    if (!s.active || s.has_outrights) continue;
    const curated = MATCH_ALLOW[s.key];
    // Always include curated AU competitions, plus any live World Cup / major
    // international tournament and current tennis events, regardless of exact key.
    const wanted =
      !!curated ||
      /world_cup/.test(s.key) ||
      /_wc(_|$)/.test(s.key) ||
      /^tennis_(atp|wta)_/.test(s.key);
    if (!wanted || seen.has(s.key)) continue;
    seen.add(s.key);
    targets.push(
      curated
        ? { key: s.key, sport: curated.sport, league: curated.league }
        : { key: s.key, sport: groupToSport(s.group), league: s.title },
    );
  }
  return targets;
}

// Decide which outright/winner (futures) markets to pull.
function selectFuturesTargets(active: SportInfo[]): FetchTarget[] {
  const targets: FetchTarget[] = [];
  const seen = new Set<string>();
  for (const s of active) {
    if (!s.active || !s.has_outrights) continue;
    // Winner/championship style markets that overlap with prediction markets.
    const wanted = /_winner$|championship|super_bowl|world_cup/.test(s.key);
    if (!wanted || seen.has(s.key)) continue;
    seen.add(s.key);
    targets.push({ key: s.key, sport: groupToSport(s.group), league: s.title });
  }
  return targets;
}

export async function fetchOddsApi(
  active: SportInfo[],
): Promise<{ events: MarketEvent[]; notes: string[] }> {
  const key = process.env.ODDS_API_KEY;
  const notes: string[] = [];
  if (!key) {
    return { events: [], notes: ["ODDS_API_KEY not set — sportsbook odds are mocked."] };
  }

  const targets = selectMatchTargets(active);
  if (targets.length > 0) {
    notes.push(`Live sports in season: ${targets.map((t) => t.league).join(", ")}.`);
  } else if (active.length > 0) {
    notes.push("No head-to-head competitions of interest are currently in season.");
  }

  const all: MarketEvent[] = [];
  let quotaRemaining: string | null = null;
  let quotaUsed: string | null = null;
  for (const s of targets) {
    try {
      const url =
        `${BASE}/sports/${s.key}/odds?apiKey=${key}` +
        `&regions=au&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
      // Cache each sport's odds for 10 minutes to conserve the free-tier quota.
      const res = await fetch(url, { next: { revalidate: 600 } });
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
            outcomesMap.get(ok)!.quotes.push({ providerKey: bm.key, decimalOdds: o.price });
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
          category: "match",
          hasSportsbook: true,
          hasPrediction: false,
          hot: e.bookmakers.length,
        });
      }
    } catch (err) {
      notes.push(`Odds API ${s.key}: ${(err as Error).message}`);
    }
  }
  if (all.length > 0) notes.push(`Odds API: ${all.length} live sportsbook fixtures.`);
  if (quotaRemaining != null) {
    notes.push(
      `Odds API quota: ${quotaRemaining} credits remaining` +
        (quotaUsed != null ? ` (${quotaUsed} used this month).` : "."),
    );
  }
  return { events: all, notes };
}

function competitorKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Fetch outright / tournament-winner markets (futures). One MarketEvent per
// competition; outcomes are the competitors (e.g. each World Cup nation).
export async function fetchOddsApiFutures(
  active: SportInfo[],
): Promise<{ events: MarketEvent[]; notes: string[] }> {
  const key = process.env.ODDS_API_KEY;
  const notes: string[] = [];
  if (!key) return { events: [], notes: [] };

  const targets = selectFuturesTargets(active);
  const all: MarketEvent[] = [];
  for (const s of targets) {
    try {
      const url =
        `${BASE}/sports/${s.key}/odds?apiKey=${key}` +
        `&regions=au&markets=outrights&oddsFormat=decimal&dateFormat=iso`;
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) {
        if (res.status !== 404 && res.status !== 422) {
          notes.push(`Odds API ${s.key}: HTTP ${res.status}`);
        }
        continue;
      }
      const data = (await res.json()) as OddsApiEvent[];
      for (const e of data) {
        const outcomesMap = new Map<string, Outcome>();
        for (const bm of e.bookmakers) {
          const mkt = bm.markets.find((m) => m.key === "outrights");
          if (!mkt) continue;
          for (const o of mkt.outcomes) {
            const ck = competitorKey(o.name);
            if (!ck) continue;
            if (!outcomesMap.has(ck)) {
              outcomesMap.set(ck, { key: ck, label: o.name, quotes: [] });
            }
            outcomesMap.get(ck)!.quotes.push({ providerKey: bm.key, decimalOdds: o.price });
          }
        }
        const outcomes = [...outcomesMap.values()];
        if (outcomes.length < 2) continue;
        all.push({
          id: `fut-${e.id}`,
          sport: s.sport,
          sportKey: s.key,
          league: s.league,
          title: s.league,
          commenceTime: e.commence_time,
          outcomes,
          category: "futures",
          hasSportsbook: true,
          hasPrediction: false,
          hot: outcomes.length,
        });
      }
    } catch (err) {
      notes.push(`Odds API ${s.key}: ${(err as Error).message}`);
    }
  }
  if (all.length > 0) notes.push(`Odds API: ${all.length} futures markets.`);
  return { events: all, notes };
}
