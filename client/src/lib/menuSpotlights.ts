import { apiUrl } from "./api";
import type { MenuSpotlightItem, MenuSpotlightRail, MenuSpotlightsResponse } from "../types";

function parseSpotlightItem(row: unknown): MenuSpotlightItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const dish_id = Number(r.dish_id);
  if (!Number.isFinite(dish_id)) return null;
  const name = String(r.name ?? "Item").trim() || "Item";
  const rawPrice = r.price;
  let price: number | string | null = null;
  if (rawPrice != null && rawPrice !== "") {
    const n = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
    price = Number.isFinite(n) ? n : null;
  }
  const rawImg = r.image;
  const image = typeof rawImg === "string" && rawImg.trim() ? rawImg.trim() : null;
  return {
    dish_id,
    name,
    price,
    available: Boolean(r.available),
    chef_special: Boolean(r.chef_special),
    todays_special: Boolean(r.todays_special),
    must_try: Boolean(r.must_try),
    ...(image ? { image } : {}),
  };
}

function parseRails(data: unknown): MenuSpotlightRail[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const raw = o.rails;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rail): MenuSpotlightRail | null => {
      if (!rail || typeof rail !== "object") return null;
      const r = rail as Record<string, unknown>;
      const id = String(r.id ?? "").trim();
      const title = String(r.title ?? "").trim() || id;
      const itemsRaw = r.items;
      const items = Array.isArray(itemsRaw)
        ? itemsRaw.map(parseSpotlightItem).filter((x): x is MenuSpotlightItem => x !== null)
        : [];
      if (!id) return null;
      return { id, title, items };
    })
    .filter((x): x is MenuSpotlightRail => x !== null);
}

export async function fetchMenuSpotlights(hotelId: number): Promise<MenuSpotlightsResponse> {
  const url = apiUrl(`/api/menu/spotlights?hotel_id=${encodeURIComponent(String(hotelId))}`);
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw new Error("Could not reach menu spotlights.");
  }
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const detail =
      (typeof data.detail === "string" && data.detail.trim()) ||
      (typeof data.error === "string" && data.error.trim()) ||
      `Spotlights (${r.status})`;
    throw new Error(detail);
  }
  if (data.ok === false) {
    throw new Error(
      (typeof data.error === "string" && data.error.trim()) || "Could not load spotlights."
    );
  }
  return {
    ok: true,
    hotel_id: Number(data.hotel_id) || hotelId,
    rails: parseRails(data),
  };
}
