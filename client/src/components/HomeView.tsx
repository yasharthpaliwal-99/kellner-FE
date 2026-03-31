import { orderId, type KitchenStats, type Order } from "../types";
import "./HomeView.css";

type Props = {
  stats: KitchenStats | null;
  loading: boolean;
  orders: Order[];
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

function ratingStars(n: number) {
  const full = Math.min(5, Math.max(0, Math.round(n)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function feedbackFromOrders(orders: Order[]) {
  const rows: {
    text: string;
    rating: number | null;
    table_number?: number;
    customer_name: string | null;
    at: string | null;
  }[] = [];
  for (const o of orders) {
    const text = (o.review?.feedback_text ?? o.feedback ?? "").trim();
    if (!text) continue;
    const rating =
      typeof o.review?.overall_rating === "number"
        ? o.review.overall_rating
        : typeof o.rating === "number"
          ? o.rating
          : null;
    rows.push({
      text,
      rating,
      table_number: o.table_number,
      customer_name: o.customer_name ?? null,
      at: o.review?.submitted_at ?? o.updated_at ?? o.created_at ?? null,
    });
  }
  return rows.slice(0, 20);
}

export function HomeView({ stats, loading, orders }: Props) {
  const recent = [...orders]
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    )
    .slice(0, 8);

  const activity = recent
    .flatMap((o) =>
      (o.events ?? [])
        .filter((e) => e.type === "place_order")
        .map((e) => ({
          orderId: orderId(o),
          table: o.table_number,
          at: e.at,
          items: (e.detail as { items_requested?: string[] })?.items_requested ?? [],
        }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);

  const feedbackRows = feedbackFromOrders(orders);

  return (
    <div className="home">
      <section className="stat-row" aria-label="Summary">
        <div className="stat-card">
          <h2>Total orders</h2>
          <div className="stat-value" aria-live="polite">
            {loading && stats === null ? "…" : stats?.total_orders ?? "—"}
          </div>
        </div>
        <div className="stat-card">
          <h2>Subtotal sum</h2>
          <div className="stat-value" aria-live="polite">
            {loading && stats === null
              ? "…"
              : stats != null
                ? stats.subtotal_sum.toFixed(2)
                : "—"}
          </div>
        </div>
        <div className="stat-card">
          <h2>Bill requested</h2>
          <div className="stat-value" aria-live="polite">
            {loading && stats === null ? "…" : stats?.bill_requested_count ?? "—"}
          </div>
        </div>
      </section>

      {stats && (
        <section className="stat-row stat-row-status" aria-label="Orders by status">
          <div className="stat-card stat-card-compact">
            <h2>Draft</h2>
            <div className="stat-value">{stats.by_status.draft}</div>
          </div>
          <div className="stat-card stat-card-compact">
            <h2>Confirmed</h2>
            <div className="stat-value">{stats.by_status.confirmed}</div>
          </div>
          <div className="stat-card stat-card-compact">
            <h2>Completed</h2>
            <div className="stat-value">{stats.by_status.completed}</div>
          </div>
          <div className="stat-card stat-card-compact">
            <h2>Other</h2>
            <div className="stat-value">{stats.by_status.other}</div>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="feedback-heading">
        <h2 id="feedback-heading">Reviews and feedback</h2>
        <p className="panel-intro muted">
          From orders in the current filter (same as list below).
        </p>
        <div className="panel-body feedback-list">
          {!feedbackRows.length && !loading && (
            <p className="empty">No feedback text on these orders yet.</p>
          )}
          {feedbackRows.map((f, i) => (
            <blockquote key={`${f.at}-${i}`} className="feedback-item">
              {f.rating != null && (
                <p className="feedback-rating" aria-label={`Rating ${f.rating} out of 5`}>
                  <span className="feedback-stars">{ratingStars(f.rating)}</span>
                  <span className="feedback-rating-num">{f.rating} / 5</span>
                </p>
              )}
              <p className="feedback-text">{f.text}</p>
              <footer>
                {f.customer_name ? `${f.customer_name}` : "Guest"}
                {f.table_number != null ? ` · Table ${f.table_number}` : ""}
                {f.at ? ` · ${formatTime(f.at)}` : ""}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Recent voice activity</h2>
        <div className="panel-body activity-list">
          {!activity.length && !loading && (
            <p className="empty">No recent place-order events.</p>
          )}
          {activity.map((row, i) => (
            <div key={`${row.orderId}-${row.at}-${i}`} className="activity-row">
              <span className="activity-time">{formatTime(row.at)}</span>
              <span className="activity-meta">Table {row.table}</span>
              <span className="activity-items">{row.items.join(", ") || "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
