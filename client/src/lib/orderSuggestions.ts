import type { MenuSuggestion, OrderSuggestionsPayload } from "../types";

type RawOrderSuggestionItem = {
  dish_id?: unknown;
  name?: unknown;
  price?: unknown;
  image?: unknown;
  info?: unknown;
};

function asPrice(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapItem(it: RawOrderSuggestionItem): MenuSuggestion | null {
  const name = typeof it.name === "string" ? it.name.trim() : "";
  if (!name) return null;
  const dishId =
    typeof it.dish_id === "number" && Number.isFinite(it.dish_id) ? it.dish_id : null;
  return {
    dish_id: dishId,
    name,
    price: asPrice(it.price),
    currency: "USD",
    info: typeof it.info === "string" ? it.info : "",
    image: typeof it.image === "string" ? it.image : null,
  };
}

/** Parse `order_suggestions.payload` from the conversation WebSocket. */
export function parseOrderSuggestionsPayload(raw: unknown): OrderSuggestionsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(p.items) ? p.items : [];
  const items = itemsRaw
    .map((row) => mapItem(row as RawOrderSuggestionItem))
    .filter((x): x is MenuSuggestion => x != null);
  if (!items.length) return null;

  const triggered_by = Array.isArray(p.triggered_by)
    ? p.triggered_by
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const t = row as Record<string, unknown>;
          const name = typeof t.name === "string" ? t.name.trim() : "";
          const dish_id =
            typeof t.dish_id === "number" && Number.isFinite(t.dish_id) ? t.dish_id : null;
          if (!name || dish_id == null) return null;
          return { dish_id, name };
        })
        .filter((x): x is { dish_id: number; name: string } => x != null)
    : [];

  const title =
    typeof p.title === "string" && p.title.trim()
      ? p.title.trim()
      : "Pairs well with your order";

  return { title, triggered_by, items };
}
