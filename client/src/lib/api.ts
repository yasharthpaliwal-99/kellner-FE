/**
 * REST base for Kellner FastAPI.
 * - Dev: leave VITE_API_BASE_URL unset → same-origin `/api/...` (Vite proxies to uvicorn).
 * - Prod (e.g. Azure Static Web Apps): set VITE_API_BASE_URL to your API host at build time
 *   so requests go to FastAPI instead of the static app host (which has no `/api` proxy).
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base.replace(/\/$/, "")}${p}`;
}
