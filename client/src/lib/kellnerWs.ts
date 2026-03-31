import { getSessionId } from "./authSession";

/**
 * Kellner FastAPI WebSocket URL.
 * With Vite dev proxy: same host as the page (5173) → proxied to uvicorn :8000.
 * Override with VITE_KELLNER_WS_URL when not using the proxy (e.g. direct to 8000).
 */
export function getKellnerWebSocketUrl(): string {
  const explicit = import.meta.env.VITE_KELLNER_WS_URL as string | undefined;
  const sid = getSessionId();
  if (explicit?.trim()) {
    if (!sid) return explicit.trim();
    try {
      const url = new URL(explicit.trim());
      url.searchParams.set("session_id", sid);
      return url.toString();
    } catch {
      return explicit.trim();
    }
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/api/ws/conversation`;
  if (!sid) return base;
  return `${base}?session_id=${encodeURIComponent(sid)}`;
}
