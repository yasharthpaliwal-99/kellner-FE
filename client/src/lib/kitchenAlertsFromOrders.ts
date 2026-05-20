import { orderId, type Order } from "../types";

const ACTIVE_ORDER_STATUSES = new Set(["draft", "placed", "preparing", "ready"]);

function isCutleryOrCleanupRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (t.includes("bill")) return false;
  return (
    t.includes("cutlery") ||
    t.includes("cleanup") ||
    t.includes("clean up") ||
    t.includes("table clean")
  );
}

export type KitchenAlertRow = {
  id: string;
  text: string;
  created_at: string;
  table_number: number;
};

/** Same GET /api/kitchen payload as order cards — reads `order.requests` when present. */
export function buildCutleryCleanupAlertsFromOrders(orders: Order[]): KitchenAlertRow[] {
  const out: KitchenAlertRow[] = [];
  for (const o of orders) {
    if (!ACTIVE_ORDER_STATUSES.has(o.status)) continue;
    const reqs = o.requests;
    if (!Array.isArray(reqs)) continue;
    const oid = orderId(o);
    reqs.forEach((r, idx) => {
      const text = typeof r.text === "string" ? r.text.trim() : "";
      if (!text || !isCutleryOrCleanupRequest(text)) return;
      const id =
        typeof r.id === "string" && r.id.trim()
          ? r.id.trim()
          : `${oid || "order"}-${idx}-${text.slice(0, 24)}`;
      const created_at = typeof r.created_at === "string" ? r.created_at : "";
      out.push({ id, text, created_at, table_number: o.table_number });
    });
  }
  out.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  return out;
}

export { ACTIVE_ORDER_STATUSES };
