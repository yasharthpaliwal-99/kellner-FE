import { apiUrl } from "./api";
import { getAuthSession } from "./authSession";

export const DISH_LINE_STATUSES = [
  "queued",
  "preparing",
  "cooking",
  "arriving",
  "ready",
  "served",
] as const;

export type DishLineStatus = (typeof DISH_LINE_STATUSES)[number];

function authHeaders(): HeadersInit {
  const session = getAuthSession();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.session_id) {
    h["x-device-session"] = session.session_id;
  }
  return h;
}

function readJsonBody(r: Response): Promise<Record<string, unknown>> {
  return r.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

async function assertOk(r: Response, label: string) {
  if (r.ok) return;
  if (r.status === 401) {
    throw new Error("Kitchen session required — log in again.");
  }
  if (r.status === 403) {
    throw new Error("Hotel does not match session.");
  }
  if ([502, 503, 504].includes(r.status)) {
    throw new Error("Failed to fetch");
  }
  const j = await readJsonBody(r);
  const fromServer =
    (typeof j.error === "string" && j.error.trim()) ||
    (typeof j.message === "string" && j.message.trim()) ||
    "";
  throw new Error(fromServer || `${label} (${r.status})`);
}

export function isDishLineStatus(v: unknown): v is DishLineStatus {
  return typeof v === "string" && DISH_LINE_STATUSES.includes(v as DishLineStatus);
}

/** Trim / lowercase for display defaulting; backend matches spice-style normalization. */
export function normalizeDishLineStatus(v: unknown): DishLineStatus | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return isDishLineStatus(s) ? s : null;
}

export async function postKitchenLineStatus(params: {
  hotel_id: string | number;
  table_number: number;
  dish_name: string;
  dish_status: DishLineStatus;
}): Promise<Record<string, unknown>> {
  const dish = params.dish_name.trim();
  if (!dish) throw new Error("Missing dish name");
  if (!isDishLineStatus(params.dish_status)) {
    throw new Error("Invalid dish_status");
  }

  const r = await fetch(apiUrl("/api/kitchen/line-status"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hotel_id: String(params.hotel_id).trim(),
      table_number: params.table_number,
      dish_name: dish,
      dish_status: params.dish_status,
    }),
  });
  await assertOk(r, "Could not update dish status");
  return readJsonBody(r);
}
