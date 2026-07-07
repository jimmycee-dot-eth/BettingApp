import type { MarketEvent, Quote } from "./types";

// A normalised quote coming out of a prediction market (Polymarket / Kalshi),
// before it is matched onto a sportsbook event.
export interface PredictionQuote {
  provider: "polymarket" | "kalshi";
  title: string;
  outcomes: { label: string; price: number; decimalOdds: number }[];
  volume: number;
}

const STOP = new Set([
  "the", "vs", "v", "at", "and", "fc", "will", "win", "beat", "to", "of", "a",
  "match", "game", "who", "wins", "in", "on", "for", "be", "next", "2024",
  "2025", "2026", "club", "team",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

// Attach prediction-market quotes onto matching sportsbook events, in place.
// Best-effort: cross-market titles rarely align perfectly, so we only attach
// when there is a confident token overlap. Returns match count for notes.
export function attachPredictions(
  events: MarketEvent[],
  predictions: PredictionQuote[],
): number {
  let matched = 0;

  for (const pq of predictions) {
    const pqTokens = tokens(pq.title);
    if (pqTokens.size === 0) continue;

    // Find the best-matching event by combined outcome-label token overlap.
    let bestEvent: MarketEvent | null = null;
    let bestScore = 0;
    for (const ev of events) {
      if (!ev.hasSportsbook) continue;
      const evTokens = tokens(ev.title);
      const score = overlap(pqTokens, evTokens);
      if (score > bestScore) {
        bestScore = score;
        bestEvent = ev;
      }
    }
    // Require at least two shared distinctive tokens (usually both team names,
    // or a team + a strong keyword) to avoid false positives.
    if (!bestEvent || bestScore < 2) continue;

    const ev = bestEvent;

    if (pq.outcomes.length >= 2 && !isBinaryYesNo(pq)) {
      // Multi-named-outcome market: map each prediction outcome to the event
      // outcome whose label best overlaps it.
      for (const po of pq.outcomes) {
        const target = bestOutcomeFor(ev, po.label);
        if (target) {
          addQuote(ev, target, pq.provider, po.decimalOdds, po.price);
          matched++;
        }
      }
    } else if (pq.outcomes.length === 2 && ev.outcomes.length === 2) {
      // Binary Yes/No market: figure out which team the question is about, so
      // "Yes" maps to that outcome and "No" to the other.
      const yes = pq.outcomes.find((o) => /yes/i.test(o.label)) ?? pq.outcomes[0];
      const no = pq.outcomes.find((o) => /no/i.test(o.label)) ?? pq.outcomes[1];
      const subject = subjectOutcomeKey(ev, pqTokens);
      if (subject) {
        const other = ev.outcomes.find((o) => o.key !== subject)!;
        addQuote(ev, subject, pq.provider, yes.decimalOdds, yes.price);
        addQuote(ev, other.key, pq.provider, no.decimalOdds, no.price);
        matched++;
      }
    }
  }
  return matched;
}

// Attach prediction quotes onto FUTURES markets. Prediction markets phrase
// these per-competitor ("Will Brazil win the World Cup?"), so we identify the
// tournament by title tokens, then the competitor within it, and attach the
// YES price to that competitor's outcome. Returns match count.
export function attachPredictionsToFutures(
  futures: MarketEvent[],
  predictions: PredictionQuote[],
): number {
  let matched = 0;
  for (const pq of predictions) {
    const qTokens = tokens(pq.title);
    if (qTokens.size === 0) continue;

    // Find the futures market whose title (tournament) best matches.
    let bestEvent: MarketEvent | null = null;
    let bestScore = 0;
    for (const ev of futures) {
      const score = overlap(qTokens, tokens(ev.title));
      if (score > bestScore) {
        bestScore = score;
        bestEvent = ev;
      }
    }
    // Require the tournament name to be clearly present (e.g. "world"+"cup").
    if (!bestEvent || bestScore < 2) continue;

    if (isBinaryYesNo(pq)) {
      // "Will <competitor> win?" — YES maps to the competitor named in the title.
      const yes = pq.outcomes.find((o) => /yes/i.test(o.label)) ?? pq.outcomes[0];
      const target = competitorInTitle(bestEvent, qTokens);
      if (target) {
        addQuote(bestEvent, target, pq.provider, yes.decimalOdds, yes.price);
        matched++;
      }
    } else {
      // Multi-named market: map each named outcome onto a competitor.
      for (const po of pq.outcomes) {
        const target = bestOutcomeFor(bestEvent, po.label);
        if (target) {
          addQuote(bestEvent, target, pq.provider, po.decimalOdds, po.price);
          matched++;
        }
      }
    }
  }
  return matched;
}

// Which competitor outcome is named in the (tournament) question title?
function competitorInTitle(ev: MarketEvent, qTokens: Set<string>): string | null {
  const titleTokens = tokens(ev.title);
  let best: string | null = null;
  let bestScore = 0;
  for (const o of ev.outcomes) {
    // Only consider label tokens that aren't part of the tournament name.
    const labelTokens = new Set([...tokens(o.label)].filter((t) => !titleTokens.has(t)));
    const score = overlap(qTokens, labelTokens);
    if (score > bestScore) {
      bestScore = score;
      best = o.key;
    }
  }
  return bestScore > 0 ? best : null;
}

function isBinaryYesNo(pq: PredictionQuote): boolean {
  return (
    pq.outcomes.length === 2 &&
    pq.outcomes.every((o) => /^(yes|no)$/i.test(o.label.trim()))
  );
}

function bestOutcomeFor(ev: MarketEvent, label: string): string | null {
  const lt = tokens(label);
  let best: string | null = null;
  let bestScore = 0;
  for (const o of ev.outcomes) {
    const score = overlap(lt, tokens(o.label));
    if (score > bestScore) {
      bestScore = score;
      best = o.key;
    }
  }
  return bestScore > 0 ? best : null;
}

// Which event outcome is the yes/no question "about"?
function subjectOutcomeKey(ev: MarketEvent, qTokens: Set<string>): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const o of ev.outcomes) {
    if (o.key === "draw") continue;
    const score = overlap(qTokens, tokens(o.label));
    if (score > bestScore) {
      bestScore = score;
      best = o.key;
    }
  }
  return bestScore > 0 ? best : null;
}

function addQuote(
  ev: MarketEvent,
  outcomeKey: string,
  provider: string,
  decimalOdds: number,
  price: number,
): void {
  if (!(decimalOdds > 0)) return;
  const outcome = ev.outcomes.find((o) => o.key === outcomeKey);
  if (!outcome) return;
  // Don't duplicate if this provider already quoted this outcome.
  if (outcome.quotes.some((q) => q.providerKey === provider)) return;
  const q: Quote = { providerKey: provider, decimalOdds, impliedProb: +price.toFixed(4) };
  outcome.quotes.push(q);
  ev.hasPrediction = true;
}
