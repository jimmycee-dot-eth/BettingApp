export function fmtOdds(o: number): string {
  if (!o || o <= 0) return "—";
  return o.toFixed(2);
}

export function fmtPct(p: number, digits = 1): string {
  return `${p.toFixed(digits)}%`;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });
}

export function fmtCents(prob?: number): string {
  if (prob == null) return "";
  return `${Math.round(prob * 100)}c`;
}

export function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "live / started";
  const h = Math.floor(ms / 3600_000);
  const d = Math.floor(h / 24);
  if (d >= 2) return `in ${d}d`;
  if (h >= 1) return `in ${h}h`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `in ${m}m`;
}
