import type { MenuSuggestion } from "../types";
import "./MenuSuggestionCards.css";

const SLOT_COUNT = 4;

function formatPrice(price: number | null, currency: string) {
  if (price == null || Number.isNaN(price)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(price);
  } catch {
    return `${price}`;
  }
}

type Props = {
  items: MenuSuggestion[];
  loading: boolean;
};

export function MenuSuggestionCards({ items, loading }: Props) {
  const slots: (MenuSuggestion | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    slots.push(items[i] ?? null);
  }

  return (
    <div className="menu-suggestion-cards" role="list">
      {slots.map((item, index) => (
        <article
          key={item ? `${item.dish_id}-${item.name}-${index}` : `empty-${index}`}
          className={`menu-suggestion-card ${item ? "has-item" : "is-empty"}`}
          role="listitem"
        >
          {loading && index === 0 ? (
            <p className="menu-card-loading">Loading suggestions…</p>
          ) : item ? (
            <>
              <header className="menu-card-head">
                <span className="menu-card-name">{item.name}</span>
                <span className="menu-card-price">{formatPrice(item.price, item.currency)}</span>
              </header>
              <p className="menu-card-info">
                {item.info?.trim() ? item.info : "Ask Kellner for details or to add this to your order."}
              </p>
            </>
          ) : (
            <p className="menu-card-placeholder">Next suggestion will appear here</p>
          )}
        </article>
      ))}
    </div>
  );
}
