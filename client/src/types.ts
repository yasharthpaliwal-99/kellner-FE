export type LineItem = {
  line_id: string;
  dish_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type OrderEvent = {
  at: string;
  type: string;
  detail?: unknown;
};

export type OrderReview = {
  overall_rating: number | null;
  feedback_text: string | null;
  submitted_at: string | null;
  updated_at: string | null;
};

export type OrderBilling = {
  bill_requested_at: string | null;
};

export type Order = {
  /** Present on GET /api/kitchen responses (Mongo id). */
  _id?: string;
  /** Present on PATCH /api/orders/:id/status responses (legacy). */
  id?: string;
  hotel_id?: number;
  customer_id?: number;
  customer_name?: string | null;
  session_id?: string;
  status: string;
  table_number: number;
  currency?: string;
  line_items: LineItem[];
  subtotal?: number;
  source?: string;
  events: OrderEvent[];
  created_at: string;
  updated_at?: string;
  version?: number;
  rating?: number | null;
  feedback?: string | null;
  review?: OrderReview | null;
  billing?: OrderBilling | null;
};

/** GET /api/kitchen stats block (aligned with FastAPI). */
export type KitchenStats = {
  total_orders: number;
  by_status: {
    draft: number;
    confirmed: number;
    completed: number;
    other: number;
  };
  subtotal_sum: number;
  bill_requested_count: number;
};

export type KitchenFilterMeta = {
  date: string | null;
  field: string;
  timezone: string;
  gte: string | null;
  lt: string | null;
};

export type KitchenResponse = {
  hotel_id: string;
  filter: KitchenFilterMeta;
  orders: Order[];
  stats: KitchenStats;
};

/** Stable id for PATCH / list keys — kitchen orders use `_id`. */
export function orderId(o: Order): string {
  return o._id ?? o.id ?? "";
}

/** Dish row for customer suggestion strip (from API). */
export type MenuSuggestion = {
  dish_id: number | null;
  name: string;
  price: number | null;
  currency: string;
  info: string;
};

// ── assistant_structured payload shapes ──────────────────────────────────────

export type StructuredBillItem = { name: string; quantity: number; price: number | null };

export type StructuredBillPayload = {
  items: StructuredBillItem[];
  total: number | null;
};

export type StructuredOrderItem = { name: string; quantity: number };

export type StructuredOrderConfirmationPayload = {
  items: StructuredOrderItem[];
};

export type StructuredRecItem = { name: string; quantity: number; price: number | null };

export type StructuredRecommendationsPayload = {
  recommendation_focus: string;
  items: StructuredRecItem[];
};

export type StructuredData =
  | { mode: "bill"; payload: StructuredBillPayload }
  | { mode: "order_confirmation"; payload: StructuredOrderConfirmationPayload }
  | { mode: "recommendations"; payload: StructuredRecommendationsPayload };
