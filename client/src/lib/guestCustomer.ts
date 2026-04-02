/** Optional face-recognition customer id for the current guest browser session (sessionStorage). */
const KEY = "kellner_guest_customer_id";

export function getGuestCustomerId(): number | null {
  const v = sessionStorage.getItem(KEY);
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function setGuestCustomerId(id: number) {
  sessionStorage.setItem(KEY, String(id));
}

export function clearGuestCustomerId() {
  sessionStorage.removeItem(KEY);
}
