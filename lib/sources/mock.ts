import type { MarketEvent, Outcome, Quote } from "../types";

// Realistic demo data so the app is fully functional with zero API keys.
// A couple of events are deliberately constructed to expose a real arbitrage
// once you take the best price per outcome across providers.

type Px = Record<string, number>; // providerKey -> decimal odds

function outcome(key: string, label: string, px: Px): Outcome {
  const quotes: Quote[] = Object.entries(px).map(([providerKey, decimalOdds]) => {
    const q: Quote = { providerKey, decimalOdds };
    // Tag prediction-market quotes with the implied cents price for display.
    if (providerKey === "polymarket" || providerKey === "kalshi") {
      q.impliedProb = +(1 / decimalOdds).toFixed(4);
    }
    return q;
  });
  return { key, label, quotes };
}

function ev(
  id: string,
  sport: string,
  sportKey: string,
  league: string,
  title: string,
  hoursFromNow: number,
  hot: number,
  outcomes: Outcome[],
): MarketEvent {
  const hasSportsbook = outcomes.some((o) =>
    o.quotes.some((q) => q.providerKey !== "polymarket" && q.providerKey !== "kalshi"),
  );
  const hasPrediction = outcomes.some((o) =>
    o.quotes.some((q) => q.providerKey === "polymarket" || q.providerKey === "kalshi"),
  );
  return {
    id,
    sport,
    sportKey,
    league,
    title,
    commenceTime: new Date(Date.now() + hoursFromNow * 3600_000).toISOString(),
    outcomes,
    hasSportsbook,
    hasPrediction,
    hot,
  };
}

export function mockEvents(): MarketEvent[] {
  return [
    // --- Clear ARB: best of 2.14 / 2.02 -> implied 0.4673+0.4950 = 0.9623 (~3.9%)
    ev("afl-coll-carl", "AFL", "aussierules_afl", "AFL", "Collingwood Magpies vs Carlton Blues", 26, 98, [
      outcome("home", "Collingwood Magpies", {
        sportsbet: 2.14, tab: 2.05, ladbrokes_au: 2.08, neds: 2.1, pointsbetau: 2.0, betfair_ex_au: 2.12,
      }),
      outcome("away", "Carlton Blues", {
        sportsbet: 1.8, tab: 1.85, ladbrokes_au: 1.83, neds: 1.82, pointsbetau: 2.02, polymarket: 1.98, kalshi: 2.02,
      }),
    ]),

    // --- Clear ARB across book vs prediction market on NBA
    ev("nba-bos-den", "NBA", "basketball_nba", "NBA", "Boston Celtics vs Denver Nuggets", 8, 95, [
      outcome("home", "Boston Celtics", {
        sportsbet: 1.72, tab: 1.7, ladbrokes_au: 1.74, neds: 1.71, unibet: 1.73, polymarket: 1.69,
      }),
      outcome("away", "Denver Nuggets", {
        sportsbet: 2.2, tab: 2.25, ladbrokes_au: 2.18, neds: 2.24, unibet: 2.15, polymarket: 2.58, kalshi: 2.5,
      }),
    ]),

    // --- No arb, but a big market gap (Polymarket way off the books)
    ev("epl-ars-mci", "Soccer", "soccer_epl", "EPL", "Arsenal vs Manchester City", 50, 92, [
      outcome("home", "Arsenal", { sportsbet: 2.9, tab: 2.8, ladbrokes_au: 2.95, neds: 2.85, betfair_ex_au: 3.0 }),
      outcome("draw", "Draw", { sportsbet: 3.5, tab: 3.4, ladbrokes_au: 3.5, neds: 3.45, betfair_ex_au: 3.55 }),
      outcome("away", "Manchester City", {
        sportsbet: 2.5, tab: 2.45, ladbrokes_au: 2.55, neds: 2.5, betfair_ex_au: 2.6, polymarket: 2.9, kalshi: 2.75,
      }),
    ]),

    // --- NRL tight market (small overround, no arb)
    ev("nrl-pen-bri", "NRL", "rugbyleague_nrl", "NRL", "Penrith Panthers vs Brisbane Broncos", 30, 88, [
      outcome("home", "Penrith Panthers", { sportsbet: 1.55, tab: 1.53, ladbrokes_au: 1.57, neds: 1.54, betr_au: 1.56 }),
      outcome("away", "Brisbane Broncos", { sportsbet: 2.5, tab: 2.55, ladbrokes_au: 2.48, neds: 2.52, betr_au: 2.6 }),
    ]),

    // --- Tennis, book vs prediction, thin arb
    ev("atp-sin-alc", "Tennis", "tennis_atp", "ATP", "Jannik Sinner vs Carlos Alcaraz", 20, 90, [
      outcome("home", "Jannik Sinner", {
        sportsbet: 2.05, tab: 2.0, ladbrokes_au: 2.02, neds: 2.04, polymarket: 2.1, kalshi: 2.06,
      }),
      outcome("away", "Carlos Alcaraz", {
        sportsbet: 1.85, tab: 1.9, ladbrokes_au: 1.88, neds: 1.86, polymarket: 1.98, kalshi: 1.95,
      }),
    ]),

    // --- US Politics: prediction markets only vs a couple of novelty books
    ev("pol-us-pres", "Politics", "politics_us", "US Politics", "Next US Election — Party Winner", 720, 85, [
      outcome("dem", "Democratic", { polymarket: 2.08, kalshi: 2.12, sportsbet: 1.95, ladbrokes_au: 2.0 }),
      outcome("rep", "Republican", { polymarket: 1.96, kalshi: 1.92, sportsbet: 1.9, ladbrokes_au: 1.95 }),
    ]),

    // --- NBA championship futures, prediction heavy, no arb
    ev("nba-champ", "NBA", "basketball_nba_championship", "NBA Futures", "NBA Championship — Winner (OKC vs Field)", 2000, 80, [
      outcome("okc", "Oklahoma City Thunder", { polymarket: 3.4, kalshi: 3.5, sportsbet: 3.25, tab: 3.3 }),
      outcome("field", "Field", { polymarket: 1.38, kalshi: 1.36, sportsbet: 1.4, tab: 1.42 }),
    ]),

    // --- A-League (AU soccer), 3-way, books only
    ev("aleague-syd-mel", "Soccer", "soccer_australia_aleague", "A-League", "Sydney FC vs Melbourne Victory", 44, 72, [
      outcome("home", "Sydney FC", { sportsbet: 2.3, tab: 2.25, ladbrokes_au: 2.35, neds: 2.28, bluebet: 2.32 }),
      outcome("draw", "Draw", { sportsbet: 3.3, tab: 3.4, ladbrokes_au: 3.25, neds: 3.35, bluebet: 3.3 }),
      outcome("away", "Melbourne Victory", { sportsbet: 3.1, tab: 3.0, ladbrokes_au: 3.15, neds: 3.05, bluebet: 3.2 }),
    ]),
  ];
}
