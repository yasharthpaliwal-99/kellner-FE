import type {
  StructuredData,
  StructuredBillPayload,
  StructuredOrderConfirmationPayload,
  StructuredRecommendationsPayload,
} from "../types";
import "./StructuredPanel.css";

function formatPrice(price: number | null): string {
  if (price == null || Number.isNaN(price)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(price);
  } catch {
    return `${price}`;
  }
}

// ─── Bill ────────────────────────────────────────────────────────────────────

function BillView({ payload }: { payload: StructuredBillPayload }) {
  return (
    <div className="sp-card sp-bill" role="region" aria-label="Your bill">
      <div className="sp-bill-header">
        <span className="sp-label">Bill</span>
        <svg className="sp-bill-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>

      <ol className="sp-bill-items" aria-label="Bill items">
        {payload.items.map((item, i) => (
          <li key={i} className="sp-bill-row">
            <span className="sp-bill-name">{item.name}</span>
            <span className="sp-bill-qty">×{item.quantity}</span>
            <span className="sp-bill-price">{formatPrice(item.price)}</span>
          </li>
        ))}
      </ol>

      <div className="sp-bill-divider" aria-hidden />

      <div className="sp-bill-total">
        <span className="sp-bill-total-label">Total</span>
        <span className="sp-bill-total-amount">{formatPrice(payload.total)}</span>
      </div>
    </div>
  );
}

// ─── Order Confirmation ───────────────────────────────────────────────────────

function OrderConfirmView({ payload }: { payload: StructuredOrderConfirmationPayload }) {
  return (
    <div className="sp-card sp-confirm" role="region" aria-label="Order confirmation">
      <div className="sp-confirm-top">
        <div className="sp-confirm-check" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <span className="sp-label">Order placed</span>
          <p className="sp-confirm-title">On its way!</p>
        </div>
      </div>

      <ul className="sp-confirm-items" aria-label="Items ordered">
        {payload.items.map((item, i) => (
          <li key={i} className="sp-confirm-row">
            <span className="sp-confirm-dot" aria-hidden />
            <span className="sp-confirm-name">{item.name}</span>
            {item.quantity > 1 && (
              <span className="sp-confirm-qty">×{item.quantity}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Recommendations (structured) ────────────────────────────────────────────

function StructuredRecsView({ payload }: { payload: StructuredRecommendationsPayload }) {
  return (
    <div className="sp-recs" role="region" aria-label="Recommendations">
      {payload.recommendation_focus && (
        <p className="sp-recs-focus" aria-label="Recommendation focus">
          {payload.recommendation_focus}
        </p>
      )}
      <ol className="sp-recs-list" aria-label="Recommended items">
        {payload.items.map((item, i) => (
          <li key={i} className="sp-rec-card">
            <span className="sp-rec-rank">#{i + 1}</span>
            <div className="sp-rec-body">
              <span className="sp-rec-name">{item.name}</span>
              {item.price != null && (
                <span className="sp-rec-price">{formatPrice(item.price)}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

type Props = { data: StructuredData };

export function StructuredPanel({ data }: Props) {
  if (data.mode === "bill") return <BillView payload={data.payload} />;
  if (data.mode === "order_confirmation") return <OrderConfirmView payload={data.payload} />;
  if (data.mode === "recommendations") return <StructuredRecsView payload={data.payload} />;
  return null;
}
