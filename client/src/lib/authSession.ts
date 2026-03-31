export type AuthSession = {
  ok: boolean;
  session_id: string;
  hotel_id: number;
  role: "device" | "kitchen";
  table_number?: number;
  device_id?: string;
};

const AUTH_KEY = "kellner_auth_session";
const DEVICE_ID_KEY = "kellner_device_id";

export function saveAuthSession(session: AuthSession) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  if (session.device_id) {
    localStorage.setItem(DEVICE_ID_KEY, session.device_id);
  }
}

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.session_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSessionId(): string | null {
  return getAuthSession()?.session_id ?? null;
}

export function getSavedDeviceId(): string {
  return localStorage.getItem(DEVICE_ID_KEY) ?? "";
}

