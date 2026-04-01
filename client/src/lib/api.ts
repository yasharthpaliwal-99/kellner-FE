/**
 * REST base for Kellner FastAPI.
 * - Dev: VITE_API_BASE_URL may be omitted and Vite proxy handles `/api/*`.
 * - Prod: VITE_API_BASE_URL is mandatory to avoid calling static-host `/api/*`.
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    if (import.meta.env.PROD) {
      throw new Error(
        "Missing VITE_API_BASE_URL in production build. Set it to your backend origin."
      );
    }
    return p;
  }
  return `${base.replace(/\/$/, "")}${p}`;
}
