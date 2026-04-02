import { getSessionId } from "./authSession";
import { getGuestCustomerId } from "./guestCustomer";

function httpToWs(httpUrl: string): string {
  return httpUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

function wsWithSessionAndCustomer(wsUrl: string): string {
  const sid = getSessionId();
  const cid = getGuestCustomerId();
  try {
    const url = new URL(wsUrl);
    if (sid) url.searchParams.set("session_id", sid);
    if (cid != null) url.searchParams.set("customer_id", String(cid));
    return url.toString();
  } catch {
    return wsUrl;
  }
}

/**
 * Kellner FastAPI WebSocket URL.
 * - Same-origin: no env — `wss?://<page host>/api/ws/conversation` (nginx + Vite proxy in dev).
 * - Split hosts: set `VITE_WS_BASE_URL` or `VITE_KELLNER_WS_URL`, or derive from `VITE_API_BASE_URL`.
 * - Adds `customer_id` when set (face recognition) — see `guestCustomer.ts`.
 */
export function getKellnerWebSocketUrl(): string {
  const explicit =
    (import.meta.env.VITE_WS_BASE_URL as string | undefined) ||
    (import.meta.env.VITE_KELLNER_WS_URL as string | undefined);
  if (explicit?.trim()) {
    const raw = explicit.trim().replace(/\/$/, "");
    const base = raw.endsWith("/api/ws/conversation") ? raw : `${raw}/api/ws/conversation`;
    return wsWithSessionAndCustomer(base);
  }
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (apiBase) {
    const http = new URL("/api/ws/conversation", apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
    return wsWithSessionAndCustomer(httpToWs(http.toString()));
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/api/ws/conversation`;
  return wsWithSessionAndCustomer(base);
}
