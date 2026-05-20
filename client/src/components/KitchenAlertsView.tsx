import { useMemo } from "react";
import type { Order } from "../types";
import {
  ACTIVE_ORDER_STATUSES,
  buildCutleryCleanupAlertsFromOrders,
} from "../lib/kitchenAlertsFromOrders";
import "./KitchenAlertsView.css";

function formatWhen(iso: string) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = {
  hotelId: string | null;
  orders: Order[];
  /** Same loading flag as Home / Orders — kitchen poll in progress. */
  loading: boolean;
};

export function KitchenAlertsView({ hotelId, orders, loading }: Props) {
  const cards = useMemo(() => buildCutleryCleanupAlertsFromOrders(orders), [orders]);

  const activeOrderCount = useMemo(
    () => orders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status)).length,
    [orders]
  );

  const anyOrderHasRequestsField = useMemo(
    () => orders.some((o) => Array.isArray(o.requests) && o.requests.length > 0),
    [orders]
  );

  return (
    <div className="kitchen-alerts">
      <header className="kitchen-alerts-head">
        <div>
          <h1 className="kitchen-alerts-title">Alerts</h1>
          <p className="kitchen-alerts-sub">
            Cutlery and table cleanup from guest tablets. Refreshes with the same{" "}
            <strong>GET /api/kitchen</strong> poll as the order list — each order may include a{" "}
            <code>requests</code> array.
          </p>
        </div>
        <div className="kitchen-alerts-live-wrap">
          <span className={`kitchen-alerts-live${!loading ? " is-on" : ""}`}>
            {loading ? "Refreshing…" : "In sync with orders"}
          </span>
          {activeOrderCount > 0 ? (
            <span className="kitchen-alerts-tables-meta">
              {activeOrderCount} active order(s) in this poll
            </span>
          ) : null}
        </div>
      </header>

      {!hotelId ? (
        <p className="kitchen-alerts-muted">Missing hotel — add <code>?hotel_id=…</code> or log in.</p>
      ) : !activeOrderCount ? (
        <div className="kitchen-alerts-empty">
          <p className="kitchen-alerts-empty-title">No active orders</p>
          <p className="kitchen-alerts-empty-text">
            Alerts appear for orders in draft, placed, preparing, or ready — same scope as the
            order list.
          </p>
        </div>
      ) : !anyOrderHasRequestsField ? (
        <div className="kitchen-alerts-empty kitchen-alerts-empty--soft">
          <p className="kitchen-alerts-empty-title">No request data on orders yet</p>
          <p className="kitchen-alerts-empty-text">
            The UI reads <code>requests</code> on each order from <code>GET /api/kitchen</code>. When
            the backend includes the same notes you store in Mongo, they will show here on the next
            refresh (same timing as order cards).
          </p>
        </div>
      ) : !cards.length ? (
        <div className="kitchen-alerts-empty kitchen-alerts-empty--soft">
          <p className="kitchen-alerts-empty-title">No cutlery or cleanup requests yet</p>
          <p className="kitchen-alerts-empty-text">
            Requests are present on orders but none matched cutlery / cleanup wording yet.
          </p>
        </div>
      ) : (
        <ul className="kitchen-alerts-grid" aria-label="Service requests">
          {cards.map((r) => (
            <li key={`${r.table_number}-${r.id}`}>
              <article className="kitchen-alert-card">
                <div className="kitchen-alert-card-top">
                  <span className="kitchen-alert-table">Table {r.table_number}</span>
                  {r.created_at ? (
                    <time className="kitchen-alert-time" dateTime={r.created_at}>
                      {formatWhen(r.created_at)}
                    </time>
                  ) : null}
                </div>
                <p className="kitchen-alert-text">{r.text}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
