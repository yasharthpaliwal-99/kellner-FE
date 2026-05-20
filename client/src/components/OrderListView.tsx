import { useEffect, useState } from "react";
import { orderId, type Order } from "../types";
import {
  DISH_LINE_STATUSES,
  type DishLineStatus,
  normalizeDishLineStatus,
} from "../lib/kitchenLineStatusApi";
import { formatAmount } from "../lib/formatAmount";
import { normalizeSpiceLevel, spiceSliderLabel, spiceToSliderIndex } from "../lib/orderSpice";
import "./OrderListView.css";

type Props = {
  orders: Order[];
  loading: boolean;
  onUpdateLineDishStatus: (params: {
    tableNumber: number;
    dishName: string;
    dishStatus: DishLineStatus;
  }) => Promise<void>;
  /** Wire to backend when ready — toggles order/session status draft ↔ completed. */
  onSessionCompleteChange?: (params: {
    orderId: string;
    tableNumber: number;
    completed: boolean;
  }) => Promise<void>;
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

function dishStatusLabel(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function spiceDisplay(lineSpice: unknown): { text: string; set: boolean } {
  if (normalizeSpiceLevel(lineSpice) == null) return { text: "—", set: false };
  return { text: spiceSliderLabel(spiceToSliderIndex(lineSpice)), set: true };
}

function isSessionCompleted(status: string): boolean {
  return status.trim().toLowerCase() === "completed";
}

type SessionCompleteSwitchProps = {
  switchId: string;
  completed: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (completed: boolean) => void;
};

function SessionCompleteSwitch({
  switchId,
  completed,
  disabled,
  busy,
  onChange,
}: SessionCompleteSwitchProps) {
  const labelId = `${switchId}-label`;
  return (
    <div className="session-complete-switch">
      <span className="session-complete-switch__label" id={labelId}>
        Session
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={completed}
        aria-labelledby={labelId}
        className={`session-complete-toggle${completed ? " is-on" : ""}${busy ? " is-busy" : ""}`}
        disabled={disabled || busy}
        title={completed ? "Session completed — tap to mark in progress" : "Mark session completed"}
        onClick={() => onChange(!completed)}
      >
        <span className="session-complete-toggle__track" aria-hidden>
          <span className="session-complete-toggle__thumb" />
        </span>
        <span className="session-complete-toggle__state">
          {completed ? "Complete" : "Draft"}
        </span>
      </button>
    </div>
  );
}

export function OrderListView({
  orders,
  loading,
  onUpdateLineDishStatus,
  onSessionCompleteChange,
}: Props) {
  const [busyLineKey, setBusyLineKey] = useState<string | null>(null);
  const [busySessionOrderId, setBusySessionOrderId] = useState<string | null>(null);
  /** UI-only until order status API is wired — keyed by order id. */
  const [sessionCompleteOverride, setSessionCompleteOverride] = useState<Record<string, boolean>>(
    {}
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSessionCompleteOverride((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const o of orders) {
        const id = orderId(o);
        if (id in next && isSessionCompleted(o.status) === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [orders]);

  const kitchenOrders = [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

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
                <SessionCompleteSwitch
                  switchId={`session-${oid}`}
                  completed={
                    sessionCompleteOverride[oid] ?? isSessionCompleted(o.status)
                  }
                  busy={busySessionOrderId === oid}
                  disabled={o.status.trim().toLowerCase() === "cancelled"}
                  onChange={(next) => {
                    setErr(null);
                    if (onSessionCompleteChange) {
                      setBusySessionOrderId(oid);
                      void onSessionCompleteChange({
                        orderId: oid,
                        tableNumber: o.table_number,
                        completed: next,
                      })
                        .then(() => {
                          setSessionCompleteOverride((prev) => ({ ...prev, [oid]: next }));
                        })
                        .catch((e) => {
                          setErr(
                            e instanceof Error ? e.message : "Could not update session status"
                          );
                        })
                        .finally(() => setBusySessionOrderId(null));
                      return;
                    }
                    setBusySessionOrderId(oid);
                    setSessionCompleteOverride((prev) => ({ ...prev, [oid]: next }));
                    window.setTimeout(() => setBusySessionOrderId(null), 280);
                  }}
                />
              </header>
              <p className="meta">
                {formatTime(o.created_at)}
                {o.source ? ` · ${o.source}` : ""}
                {o.subtotal != null ? ` · ${formatAmount(o.subtotal)}` : ""}
                {o.billing?.bill_requested_at
                  ? ` · Bill requested ${formatTime(o.billing.bill_requested_at)}`
                  : ""}
              </p>
              <h3 className="items-title">Items</h3>
              <ol className="items">
                {o.line_items?.map((li, idx) => {
                  const spice = spiceDisplay(li.spice_level);
                  const lineKey = `${oid}-${li.line_id || idx}`;
                  const dishName = (li.name ?? "").trim() || `Dish ${idx + 1}`;
                  const rawDishStatus = li.dish_status;
                  const resolved = normalizeDishLineStatus(rawDishStatus);
                  const selectValue = resolved ?? "queued";
                  const rawUnrecognized =
                    rawDishStatus != null &&
                    String(rawDishStatus).trim().length > 0 &&
                    !resolved;
                  return (
                    <li key={li.line_id || idx} className="order-line">
                      <div className="order-line-row">
                        <span className="dish">{li.name}</span>
                        <span className="qty">× {li.quantity}</span>
                      </div>
                      <p className="order-line-spice-readout" aria-label={`Spice for ${li.name}`}>
                        <span className="order-line-spice-label">Spice</span>
                        <span
                          className={`order-line-spice-value${spice.set ? " is-set" : " is-unset"}`}
                        >
                          {spice.text}
                        </span>
                      </p>
                      <div className="order-line-dish-status">
                        <label className="order-line-dish-status-label" htmlFor={`dish-status-${lineKey}`}>
                          Dish status
                        </label>
                        <select
                          id={`dish-status-${lineKey}`}
                          className="dish-status-select"
                          value={selectValue}
                          disabled={busyLineKey === lineKey}
                          onChange={(e) => {
                            const next = e.target.value as DishLineStatus;
                            if (!normalizeDishLineStatus(next)) return;
                            if (next === selectValue) return;
                            setErr(null);
                            setBusyLineKey(lineKey);
                            void onUpdateLineDishStatus({
                              tableNumber: o.table_number,
                              dishName,
                              dishStatus: next,
                            })
                              .catch((err2) => {
                                setErr(
                                  err2 instanceof Error ? err2.message : "Dish status update failed"
                                );
                              })
                              .finally(() => setBusyLineKey(null));
                          }}
                        >
                          {DISH_LINE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {dishStatusLabel(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {rawUnrecognized ? (
                        <p className="order-line-dish-status-note muted" role="note">
                          Unrecognized status from API: {String(rawDishStatus).trim()} — showing as
                          queued until updated.
                        </p>
                      ) : null}
                    </li>
                  );
                })}
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
            </article>
          );
        })}
      </div>
    </div>
  );
}
