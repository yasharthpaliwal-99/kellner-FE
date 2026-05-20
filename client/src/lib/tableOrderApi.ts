import { apiUrl } from "./api";
import { getAuthSession } from "./authSession";
import { normalizeSpiceLevel, type OrderSpiceLevel } from "./orderSpice";

/** Resolved from device / kitchen session — same hotel + table as draft order. */
export type TableOrderContext = {
  hotel_id: number;
  table_number: number;
};

function authHeaders(): HeadersInit {
  const session = getAuthSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.session_id) h["x-device-session"] = session.session_id;
  return h;
}

function readJsonBody(r: Response): Promise<Record<string, unknown>> {
  return r.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

async function assertOk(r: Response, label: string) {
  if (r.ok) return;
  if ([502, 503, 504].includes(r.status)) {
    throw new Error("Failed to fetch");
  }
  const j = await readJsonBody(r);
  const detail = j.detail;
  const detailStr =
    typeof detail === "string"
      ? detail.trim()
      : Array.isArray(detail) && detail.length
        ? String(detail[0])
        : "";
  const fromServer =
    (typeof j.error === "string" && j.error.trim()) ||
    (typeof j.message === "string" && j.message.trim()) ||
    detailStr ||
    "";
  throw new Error(fromServer || `${label} (${r.status})`);
}

/** 2xx unless body explicitly sets ok: false or error string. */
function assertBodyOk(data: Record<string, unknown>, label: string) {
  if (data.ok === false) {
    const msg =
      (typeof data.error === "string" && data.error.trim()) ||
      (typeof data.message === "string" && data.message.trim()) ||
      label;
    throw new Error(msg);
  }
  if (typeof data.error === "string" && data.error.trim() && data.ok !== true) {
    throw new Error(data.error.trim());
  }
}

export function tableContextFromSession(): TableOrderContext | null {
  const session = getAuthSession();
  if (!session) return null;
  const hid = Number(session.hotel_id);
  const tn = Number(session.table_number);
  if (!Number.isFinite(hid) || !Number.isFinite(tn)) return null;
  return { hotel_id: hid, table_number: tn };
}

function hotelIdParam(hotel_id: number | string): string {
  return String(hotel_id).trim();
}

/**
 * Single write path: service request and/or per-dish spice on the active table order.
 * Need at least `request_text`, or both `dish_name` + `spice_level`.
 */
export async function postOrderOps(params: {
  hotel_id: number | string;
  table_number: number;
  request_text?: string;
  dish_name?: string;
  spice_level?: OrderSpiceLevel;
}): Promise<void> {
  if (params.table_number == null || !Number.isFinite(params.table_number)) {
    throw new Error("Need table_number");
  }

  const requestText = params.request_text?.trim() ?? "";
  const dishName = params.dish_name?.trim() ?? "";
  const level = normalizeSpiceLevel(params.spice_level);

  const hasRequest = requestText.length > 0;
  const hasSpicePair = dishName.length > 0 && level != null;

  if (!hasRequest && !hasSpicePair) {
    throw new Error("Need request_text or dish_name with spice_level");
  }
  if (params.spice_level != null && !dishName) {
    throw new Error("Need dish_name with spice_level");
  }
  if (dishName && !level) {
    throw new Error("Need spice_level with dish_name");
  }

  const body: Record<string, unknown> = {
    hotel_id: hotelIdParam(params.hotel_id),
    table_number: params.table_number,
  };
  if (hasRequest) body.request_text = requestText;
  if (hasSpicePair && level) {
    body.dish_name = dishName;
    body.spice_level = level;
  }

  const r = await fetch(apiUrl("/api/kitchen/order-ops"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await assertOk(r, "Order update failed");
  const data = await readJsonBody(r);
  assertBodyOk(data, "Order update failed");
}

/** Guest/kitchen service note (cutlery, cleanup, bill, …). */
export async function appendServiceRequest(ctx: TableOrderContext, text: string): Promise<void> {
  await postOrderOps({
    hotel_id: ctx.hotel_id,
    table_number: ctx.table_number,
    request_text: text,
  });
}

/** Per-line spice — backend matches line by dish name on the table's draft order. */
export async function updateDishSpiceLevel(params: {
  hotel_id: number | string;
  table_number: number;
  dish_name: string;
  spice_level: OrderSpiceLevel;
}): Promise<void> {
  const dish = params.dish_name.trim();
  const level = normalizeSpiceLevel(params.spice_level);
  if (!dish) throw new Error("Missing dish name");
  if (!level) throw new Error("Invalid spice level");
  await postOrderOps({
    hotel_id: params.hotel_id,
    table_number: params.table_number,
    dish_name: dish,
    spice_level: level,
  });
}
