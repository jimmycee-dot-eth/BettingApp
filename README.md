# Arb Radar 🎯

A simple web app that compares **Australian sportsbook odds** against **live
Polymarket & Kalshi** prices and highlights **risk-free arbitrage**
opportunities.

Pick from a list of hot events, choose which betting providers to include, and
the app shows the gap in the market plus any arbitrage — including the exact
stake split to lock in a guaranteed profit.

## What it does

- **Hot events** across AFL, NRL, NBA, EPL, A-League, Tennis and US Politics,
  sorted by best arbitrage (or biggest price gap / hottest).
- **Provider filter** — toggle individual Australian bookmakers (Sportsbet, TAB,
  Ladbrokes, Neds, PointsBet, Unibet, Betfair, betr, BlueBet, TopSport) plus
  Polymarket and Kalshi. Arbitrage is recomputed instantly against only the
  providers you have accounts with.
- **Arbitrage detection** — takes the best price for each outcome across the
  enabled providers. If the implied probabilities sum to **under 100%**, that's
  a risk-free arb. This is exactly the user's rule of thumb: *"more than 2.00 on
  each of a two-outcome market."*
- **Stake plan** — for a bankroll you set, it shows how much to put on each
  outcome so every result pays the same, and the guaranteed profit.
- **Full odds table** — expand any event to see every provider's price side by
  side, with the best price on each outcome highlighted.

## The maths

For an event with outcomes o₁…oₙ, using the best decimal odds for each:

```
totalImplied = Σ (1 / bestOdds_i)
arbitrage    = totalImplied < 1
profit %     = (1 / totalImplied − 1) × 100
stake_i      = bankroll × (1 / bestOdds_i) / totalImplied
```

Staking proportionally guarantees the same payout whichever way the event goes.
See `lib/arb.ts`.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

It works immediately on realistic **demo data** — no API keys needed. The
prices are illustrative but the arbitrage maths is real.

### Going live

Add a free API key from [the-odds-api.com](https://the-odds-api.com) (500
requests/month, covers AU bookmakers):

```bash
cp .env.example .env
# then edit .env and set ODDS_API_KEY=your_key
```

With a key set, the app pulls **live AU sportsbook odds** and enriches them
best-effort with **live Polymarket & Kalshi** quotes matched onto the same
events. Polymarket and Kalshi need no key (public read APIs). If a live fetch
fails or returns nothing (off-season, quota), it falls back to demo data so the
UI is never blank. Data-source status is shown under "Data source notes".

## Deploying

It's a standard Next.js app — deploy to Vercel (or any Node host):

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Set `ODDS_API_KEY` as an environment variable (optional).

## Architecture

```
app/
  page.tsx            main UI (client) — filters, sorting, arb display
  api/events/route.ts unified events endpoint
lib/
  types.ts            shared domain types
  arb.ts              arbitrage maths + stake plan
  providers.ts        AU bookmaker + prediction-market metadata
  aggregate.ts        ties the sources together, mock/live selection
  match.ts            fuzzy title matching of prediction markets onto events
  sources/
    oddsapi.ts        The Odds API (AU sportsbooks)
    polymarket.ts     Polymarket Gamma API
    kalshi.ts         Kalshi public markets API
    mock.ts           realistic demo data
components/
  ProviderFilter.tsx  provider toggle chips
  EventCard.tsx       event card + odds table + stake plan
  format.ts           display helpers
```

## Notes & caveats

- Cross-market matching (a Polymarket question ↔ a sportsbook fixture) is
  best-effort by title tokens; it's conservative to avoid false positives.
- Odds move fast — always confirm the price at the book before staking, and
  factor in stake limits and account restrictions.
- Gamble responsibly.
