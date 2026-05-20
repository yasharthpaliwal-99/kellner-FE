/** Parse a numeric price from API / voice payloads. */
export function asAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Plain number display — no currency code or symbol (e.g. `119` or `119.50`). */
export function formatAmount(v: number | string | null | undefined): string {
  const n = asAmount(v);
  if (n == null) return "—";
  const hasCents = Math.abs(n % 1) > 0.001;
  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return hasCents ? n.toFixed(2) : String(Math.round(n));
  }
}
