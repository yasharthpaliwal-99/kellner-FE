import { useState } from "react";
import { orderId, type Order } from "../types";
import "./OrderListView.css";

const STATUS_OPTIONS = [
  "draft",
  "placed",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
] as const;

type Props = {
  orders: Order[];
  loading: boolean;
  onUpdateStatus: (orderId: string, status: string) => Promise<void>;
};

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function customerLabel(o: Order) {
  if (o.customer_name) return o.customer_name;
  if (o.customer_id != null) return `Customer #${o.customer_id}`;
  return "Guest";
}

function statusOptionsFor(current: string): string[] {
  const all = [...STATUS_OPTIONS];
  if (!all.includes(current)) return [current, ...all];
  return all;
}

export function OrderListView({ orders, loading, onUpdateStatus }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const kitchenOrders = [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const handleStatus = async (id: string, status: string) => {
    setErr(null);
    setBusyId(id);
    try {
      await onUpdateStatus(id, status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="order-list">
      {err && (
        <p className="inline-error" role="alert">
          {err}
        </p>
      )}
      {loading && !kitchenOrders.length && (
        <p className="muted">Loading orders…</p>
      )}
      {!loading && !kitchenOrders.length && (
        <p className="muted">No orders in the collection yet.</p>
      )}
      <div className="order-grid">
        {kitchenOrders.map((o) => {
          const rev = o.review;
          const showReview =
            rev &&
            ((typeof rev.overall_rating === "number" && !Number.isNaN(rev.overall_rating)) ||
              (typeof rev.feedback_text === "string" && rev.feedback_text.trim().length > 0));
          const oid = orderId(o);
          return (
          <article key={oid} className="order-card">
            <header className="order-card-head">
              <div>
                <h2>Table {o.table_number}</h2>
                <p className="customer">Customer — {customerLabel(o)}</p>
              </div>
              <span className={`status-pill status-${o.status}`}>{o.status}</span>
            </header>
            <p className="meta">
              {formatTime(o.created_at)}
              {o.source ? ` · ${o.source}` : ""}
              {o.currency && o.subtotal != null
                ? ` · ${o.currency} ${o.subtotal.toFixed(2)}`
                : ""}
              {o.billing?.bill_requested_at
                ? ` · Bill requested ${formatTime(o.billing.bill_requested_at)}`
                : ""}
            </p>
            <h3 className="items-title">Items</h3>
            <ol className="items">
              {o.line_items?.map((li, idx) => (
                <li key={li.line_id || idx}>
                  <span className="dish">{li.name}</span>
                  <span className="qty">× {li.quantity}</span>
                </li>
              ))}
            </ol>
            {showReview && rev && (
              <div className="order-review">
                <h3 className="review-title">Review</h3>
                {typeof rev.overall_rating === "number" && !Number.isNaN(rev.overall_rating) && (
                  <p
                    className="review-rating"
                    aria-label={`Rating ${rev.overall_rating} out of 5`}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <span
                        key={i}
                        className={i < rev.overall_rating ? "star on" : "star"}
                      >
                        ★
                      </span>
                    ))}
                    <span className="review-rating-num">{rev.overall_rating} / 5</span>
                  </p>
                )}
                {rev.feedback_text ? (
                  <p className="review-text">{rev.feedback_text}</p>
                ) : null}
                {rev.submitted_at ? (
                  <p className="review-meta">{formatTime(rev.submitted_at)}</p>
                ) : null}
              </div>
            )}
            <div className="order-actions">
              <label className="sr-only" htmlFor={`status-${oid}`}>
                Update status for table {o.table_number}
              </label>
              <select
                id={`status-${oid}`}
                className="status-select"
                value={o.status}
                disabled={busyId === oid}
                onChange={(e) => handleStatus(oid, e.target.value)}
              >
                {statusOptionsFor(o.status).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </article>
          );
        })}
      </div>
    </div>
  );
}
