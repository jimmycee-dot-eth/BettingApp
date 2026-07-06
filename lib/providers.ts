import type { Provider } from "./types";

// Australian sportsbooks. Keys match The Odds API bookmaker keys so live data
// maps straight through. Colours are used for the UI chips / attributions.
export const AU_SPORTSBOOKS: Provider[] = [
  { key: "sportsbet", name: "Sportsbet", kind: "sportsbook", country: "AU", color: "#0055a5" },
  { key: "tab", name: "TAB", kind: "sportsbook", country: "AU", color: "#00a94f" },
  { key: "ladbrokes_au", name: "Ladbrokes", kind: "sportsbook", country: "AU", color: "#e4022d" },
  { key: "neds", name: "Neds", kind: "sportsbook", country: "AU", color: "#ff6a00" },
  { key: "pointsbetau", name: "PointsBet", kind: "sportsbook", country: "AU", color: "#ed1c24" },
  { key: "unibet", name: "Unibet", kind: "sportsbook", country: "AU", color: "#14805e" },
  { key: "betfair_ex_au", name: "Betfair", kind: "sportsbook", country: "AU", color: "#ffb80c" },
  { key: "betr_au", name: "betr", kind: "sportsbook", country: "AU", color: "#6b2fb5" },
  { key: "bluebet", name: "BlueBet", kind: "sportsbook", country: "AU", color: "#1d4ed8" },
  { key: "topsport", name: "TopSport", kind: "sportsbook", country: "AU", color: "#0891b2" },
];

// Prediction / crypto markets.
export const PREDICTION_MARKETS: Provider[] = [
  { key: "polymarket", name: "Polymarket", kind: "prediction", country: "US", color: "#8b5cf6" },
  { key: "kalshi", name: "Kalshi", kind: "prediction", country: "US", color: "#00d1b2" },
];

export const ALL_PROVIDERS: Provider[] = [...AU_SPORTSBOOKS, ...PREDICTION_MARKETS];

export function providerByKey(key: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.key === key);
}
