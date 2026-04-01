/**
 * REST base for Kellner FastAPI.
 * - Same-origin (recommended): leave `VITE_API_BASE_URL` unset — browser calls `/api/...`
 *   (Vite dev proxies; nginx on the VM proxies to uvicorn).
 * - Split hosts only: set `VITE_API_BASE_URL` so requests go to another origin (then CORS must allow the UI).
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base.replace(/\/$/, "")}${p}`;
}
