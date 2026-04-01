import { getSessionId } from "./authSession";

function httpToWs(httpUrl: string): string {
  return httpUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
}

/**
 * Kellner FastAPI WebSocket URL.
 * - Dev: same host as the page → Vite proxies `/api/ws` to uvicorn.
 * - Prod: set VITE_API_BASE_URL at build time, or set VITE_KELLNER_WS_URL explicitly.
 */
export function getKellnerWebSocketUrl(): string {
  const explicit =
    (import.meta.env.VITE_WS_BASE_URL as string | undefined) ||
    (import.meta.env.VITE_KELLNER_WS_URL as string | undefined);
  const sid = getSessionId();
  if (explicit?.trim()) {
    const raw = explicit.trim().replace(/\/$/, "");
    const base = raw.endsWith("/api/ws/conversation") ? raw : `${raw}/api/ws/conversation`;
    if (!sid) return base;
    try {
      const url = new URL(base);
      url.searchParams.set("session_id", sid);
      return url.toString();
    } catch {
      return base;
    }
  }
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (apiBase) {
    const http = new URL("/api/ws/conversation", apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
    const base = httpToWs(http.toString());
    if (!sid) return base;
    return `${base}?session_id=${encodeURIComponent(sid)}`;
  }
  if (import.meta.env.PROD) {
    throw new Error(
      "Missing websocket base in production. Set VITE_WS_BASE_URL or VITE_API_BASE_URL."
    );
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/api/ws/conversation`;
  if (!sid) return base;
  return `${base}?session_id=${encodeURIComponent(sid)}`;
}
