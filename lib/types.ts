// Shared domain types for the odds-comparison / arbitrage engine.

export type ProviderKind = "sportsbook" | "prediction";

export interface Provider {
  key: string; // stable id, matches The Odds API bookmaker keys where applicable
  name: string; // display name
  kind: ProviderKind;
  country: string; // e.g. "AU", "US"
  color: string; // hex, for UI chips
}

// A single price offered by one provider for one outcome of an event.
export interface Quote {
  providerKey: string;
  decimalOdds: number; // e.g. 2.35 means stake 1 returns 2.35
  // For prediction markets we also keep the raw implied probability the
  // price came from, so the UI can show "Polymarket 44c".
  impliedProb?: number;
}

// One selectable result within an event (e.g. "Collingwood", "Draw").
export interface Outcome {
  key: string; // normalized id within the event, e.g. "home" | "away" | "draw"
  label: string; // display, e.g. "Collingwood Magpies"
  quotes: Quote[];
}

export interface MarketEvent {
  id: string;
  sport: string; // e.g. "AFL", "NBA", "Politics"
  sportKey: string;
  league?: string;
  title: string; // e.g. "Collingwood Magpies vs Carlton Blues"
  commenceTime: string; // ISO
  outcomes: Outcome[];
  // "match" = a single head-to-head fixture; "futures" = an outright/tournament
  // winner market with many competitors (e.g. World Cup winner).
  category: "match" | "futures";
  // Which sources contributed to this event.
  hasSportsbook: boolean;
  hasPrediction: boolean;
  hot?: number; // popularity / volume score for sorting "hot events"
}

// Result of running the arb engine over an event for a given provider filter.
export interface OutcomeBest {
  outcomeKey: string;
  label: string;
  bestDecimalOdds: number;
  bestProviderKey: string | null;
  impliedProb: number; // 1 / bestDecimalOdds
}

export interface ArbResult {
  eventId: string;
  outcomes: OutcomeBest[];
  totalImpliedProb: number; // sum of best implied probs; <1 => arbitrage
  overroundPct: number; // (totalImpliedProb - 1) * 100; negative => arb edge
  isArb: boolean;
  profitPct: number; // guaranteed return on total stake if arb, else 0
  // Optimal stake split (fractions summing to 1) to lock equal payout.
  stakeSplit: { outcomeKey: string; fraction: number }[];
  // Biggest odds discrepancy between any two providers on a single outcome.
  maxGapPct: number;
}

export interface EventsResponse {
  source: "mock" | "live" | "mixed";
  generatedAt: string;
  notes: string[];
  providers: Provider[];
  events: MarketEvent[];
}
