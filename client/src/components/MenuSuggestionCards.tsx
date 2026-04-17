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
  emptyMessage?: string;
};

export function MenuSuggestionCards({ items, loading, emptyMessage }: Props) {
  const visibleItems = items.slice(0, SLOT_COUNT);

  if (loading) {
    return (
      <div className="menu-suggestion-cards" role="list">
        <article className="menu-suggestion-card is-empty is-thinking" role="listitem">
          <div className="menu-thinking-wrap" aria-live="polite">
            <div className="menu-thinking-head">
              <span className="menu-thinking-dot" aria-hidden />
              <p className="menu-card-loading">Thinking about your best options…</p>
            </div>
            <div className="menu-thinking-lines" aria-hidden>
              <span className="menu-thinking-line menu-thinking-line--lg" />
              <span className="menu-thinking-line menu-thinking-line--md" />
              <span className="menu-thinking-line menu-thinking-line--sm" />
            </div>
          </div>
        </article>
      </div>
    );
  }

  if (!visibleItems.length) {
    return (
      <div className="menu-suggestion-cards" role="status" aria-live="polite">
        <article className="menu-suggestion-card is-empty">
          <p className="menu-card-empty-state">
            {emptyMessage ?? "No suggestions right now."}
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="menu-suggestion-cards" role="list">
      {visibleItems.map((item, index) => (
        <article
          key={`${item.dish_id}-${item.name}-${index}`}
          className="menu-suggestion-card has-item"
          role="listitem"
        >
          <span className="menu-card-rank">#{index + 1}</span>
          <header className="menu-card-head">
            <span className="menu-card-name">{item.name}</span>
            <span className="menu-card-price">{formatPrice(item.price, item.currency)}</span>
          </header>
          <p className="menu-card-info">
            {item.info?.trim() ? item.info : "—"}
          </p>
        </article>
      ))}
    </div>
  );
}
