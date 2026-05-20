export type LineItem = {
  line_id: string;
  dish_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  /** mild | low | medium | high when table sets spice via order-ops */
  spice_level?: string | null;
  /** Kitchen line workflow: queued | preparing | cooking | arriving | ready | served */
  dish_status?: string | null;
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

/** Guest service notes on the order document; include on GET /api/kitchen for kitchen Alerts. */
export type OrderServiceRequest = {
  id?: string | null;
  text?: string | null;
  created_at?: string | null;
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
  /** Table / cutlery notes — same poll as order cards when backend adds this to GET /api/kitchen. */
  requests?: OrderServiceRequest[] | null;
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
  image?: string | null;
};

/** Silent upsell rail after voice `place_order` (`order_suggestions` WS message). */
export type OrderSuggestionTrigger = {
  dish_id: number;
  name: string;
};

export type OrderSuggestionsPayload = {
  title: string;
  triggered_by: OrderSuggestionTrigger[];
  items: MenuSuggestion[];
};

export type OrderSuggestionsEvent = {
  turn_id: number;
  order_id: string | null;
  payload: OrderSuggestionsPayload;
};

export type KitchenNavTab = "home" | "orders" | "alerts" | "menu";

/** Kitchen menu editor — fetch_menu / save_menu / upload_menu_image */
export type KitchenMenuItem = {
  dish_id: number;
  name: string;
  price: number | string | null;
  available: boolean;
  /** Set after POST /api/upload_menu_image */
  image?: string | null;
  /**
   * Optional fields the backend may include on fetch_menu rows.
   * Kitchen editor doesn't render these, but the guest full-menu view does.
   */
  description?: string | null;
  section?: string | null;
};

