export const ORDER_SPICE_LEVELS = ["mild", "low", "medium", "high"] as const;
export type OrderSpiceLevel = (typeof ORDER_SPICE_LEVELS)[number];

const SLIDER_LABELS = ["Mild", "Low", "Medium", "High"] as const;

export function normalizeSpiceLevel(v: unknown): OrderSpiceLevel | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return ORDER_SPICE_LEVELS.includes(s as OrderSpiceLevel) ? (s as OrderSpiceLevel) : null;
}

export function isOrderSpiceLevel(v: unknown): v is OrderSpiceLevel {
  return normalizeSpiceLevel(v) != null;
}

/** Map API string → slider index 1–4 (default medium = 3). */
export function spiceToSliderIndex(v: unknown): number {
  const level = normalizeSpiceLevel(v);
  if (!level) return 3;
  const i = ORDER_SPICE_LEVELS.indexOf(level);
  return i >= 0 ? i + 1 : 3;
}

export function sliderIndexToSpice(index: number): OrderSpiceLevel {
  const i = Math.min(4, Math.max(1, Math.round(index))) - 1;
  return ORDER_SPICE_LEVELS[i] ?? "medium";
}

export function spiceSliderLabel(index: number): string {
  const i = Math.min(4, Math.max(1, Math.round(index))) - 1;
  return SLIDER_LABELS[i] ?? "Medium";
}
