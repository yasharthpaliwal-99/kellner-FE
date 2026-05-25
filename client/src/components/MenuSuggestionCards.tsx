import { useState } from "react";
import { formatAmount } from "../lib/formatAmount";
import type { MenuSuggestion } from "../types";
import "./MenuSuggestionCards.css";

/** Max recommendation cards shown (3×3 grid in INFO BOARD). */
export const RECOMMENDATION_SLOT_COUNT = 9;

type Props = {
  items: MenuSuggestion[];
  loading: boolean;
  emptyMessage?: string;
};

function SuggestionCard({ item }: { item: MenuSuggestion }) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = item.image?.trim();
  const showPhoto = Boolean(url) && !imgFailed;
  const info = item.info?.trim();

  return (
    <article
      className="menu-suggestion-card has-item"
      role="listitem"
      title={info || undefined}
    >
      <div className="menu-suggestion-card-media">
        {showPhoto ? (
          <img
            className="menu-suggestion-card-img"
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="menu-suggestion-card-placeholder" aria-hidden />
        )}
      </div>
      <div className="menu-suggestion-card-body">
        <div className="menu-suggestion-card-head">
          <h3 className="menu-suggestion-card-name">{item.name}</h3>
          <span className="menu-suggestion-card-price">{formatAmount(item.price)}</span>
        </div>
      </div>
    </article>
  );
}

export function MenuSuggestionCards({ items, loading, emptyMessage }: Props) {
  const visibleItems = items.slice(0, RECOMMENDATION_SLOT_COUNT);

  if (loading) {
    return (
      <div className="menu-suggestion-cards menu-suggestion-cards--loading" role="list">
        <p className="menu-suggestion-cards-loading-label" aria-live="polite">
          Thinking about your best options…
        </p>
        <div className="menu-suggestion-cards-grid" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="menu-suggestion-card menu-suggestion-card--skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (!visibleItems.length) {
    return (
      <div className="menu-suggestion-cards" role="status" aria-live="polite">
        <article className="menu-suggestion-card is-empty">
          <p className="menu-suggestion-card-empty">
            {emptyMessage ?? "No suggestions right now."}
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="menu-suggestion-cards" role="list">
      <div className="menu-suggestion-cards-grid">
        {visibleItems.map((item, index) => (
          <SuggestionCard key={`${item.dish_id}-${item.name}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}
