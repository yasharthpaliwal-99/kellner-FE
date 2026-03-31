import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSavedDeviceId, saveAuthSession, type AuthSession } from "./lib/authSession";
import "./LoginPage.css";

type Mode = "choose" | "guest" | "kitchen";

type GuestForm = {
  hotelId: string;
  password: string;
  tableNumber: string;
  deviceId: string;
};

type KitchenForm = {
  hotelId: string;
  password: string;
  deviceId: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("choose");
  const initialDeviceId = getSavedDeviceId();
  const [guest, setGuest] = useState<GuestForm>({
    hotelId: "",
    password: "",
    tableNumber: "",
    deviceId: initialDeviceId,
  });
  const [kitchen, setKitchen] = useState<KitchenForm>({
    hotelId: "",
    password: "",
    deviceId: initialDeviceId,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showGuest = mode === "guest";
  const showKitchen = mode === "kitchen";

  async function handleGuestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !guest.hotelId.trim() ||
      !guest.password.trim() ||
      !guest.tableNumber.trim() ||
      !guest.deviceId.trim()
    ) {
      setError("Fill all fields to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/device/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: Number(guest.hotelId),
          password: guest.password,
          role: "device",
          table_number: Number(guest.tableNumber),
          device_id: guest.deviceId.trim(),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<AuthSession> & {
        message?: string;
        error?: string;
      };
      if (!r.ok || !j?.ok || !j.session_id) {
        throw new Error(j.error || j.message || "Login failed");
      }
      saveAuthSession(j as AuthSession);
      const params = new URLSearchParams({ hotel_id: String(j.hotel_id ?? guest.hotelId.trim()) });
      navigate(`/guest?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleKitchenSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!kitchen.hotelId.trim() || !kitchen.password.trim() || !kitchen.deviceId.trim()) {
      setError("Fill all fields to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/device/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: Number(kitchen.hotelId),
          password: kitchen.password,
          role: "kitchen",
          device_id: kitchen.deviceId.trim(),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<AuthSession> & {
        message?: string;
        error?: string;
      };
      if (!r.ok || !j?.ok || !j.session_id) {
        throw new Error(j.error || j.message || "Login failed");
      }
      saveAuthSession(j as AuthSession);
      const params = new URLSearchParams({ hotel_id: String(j.hotel_id ?? kitchen.hotelId.trim()) });
      navigate(`/kitchen?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <header className="login-header">
          <img src="/kellnerlogo.jpg" alt="Kellner" className="login-logo" />
          <p className="login-tagline">Choose how you want to use Kellner</p>
        </header>

        {mode === "choose" && (
          <div className="login-choice">
            <button
              type="button"
              className="login-choice-card"
              onClick={() => setMode("guest")}
            >
              <h2>Login as user device</h2>
              <p>For the guest tablet or phone at the table.</p>
            </button>
            <button
              type="button"
              className="login-choice-card"
              onClick={() => setMode("kitchen")}
            >
              <h2>Login as kitchen</h2>
              <p>For the kitchen display that tracks orders.</p>
            </button>
          </div>
        )}

        {showGuest && (
          <form className="login-form" onSubmit={handleGuestSubmit}>
            <div className="login-form-head">
              <h2>User device</h2>
              <button type="button" className="login-back" onClick={() => setMode("choose")}>
                Back
              </button>
            </div>
            <div className="login-field">
              <label htmlFor="guest-hotel">Hotel ID</label>
              <input
                id="guest-hotel"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={guest.hotelId}
                onChange={(e) => setGuest((g) => ({ ...g, hotelId: e.target.value }))}
              />
            </div>
            <div className="login-field">
              <label htmlFor="guest-pass">Password</label>
              <input
                id="guest-pass"
                type="password"
                autoComplete="off"
                value={guest.password}
                onChange={(e) => setGuest((g) => ({ ...g, password: e.target.value }))}
              />
            </div>
            <div className="login-field">
              <label htmlFor="guest-table">Table number</label>
              <input
                id="guest-table"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={guest.tableNumber}
                onChange={(e) => setGuest((g) => ({ ...g, tableNumber: e.target.value }))}
              />
            </div>
            <div className="login-field">
              <label htmlFor="guest-device">Device ID</label>
              <input
                id="guest-device"
                type="text"
                autoComplete="off"
                value={guest.deviceId}
                onChange={(e) => setGuest((g) => ({ ...g, deviceId: e.target.value }))}
              />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Continue to guest"}
            </button>
          </form>
        )}

        {showKitchen && (
          <form className="login-form" onSubmit={handleKitchenSubmit}>
            <div className="login-form-head">
              <h2>Kitchen staff</h2>
              <button type="button" className="login-back" onClick={() => setMode("choose")}>
                Back
              </button>
            </div>
            <div className="login-field">
              <label htmlFor="kitchen-hotel">Hotel ID</label>
              <input
                id="kitchen-hotel"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={kitchen.hotelId}
                onChange={(e) => setKitchen((g) => ({ ...g, hotelId: e.target.value }))}
              />
            </div>
            <div className="login-field">
              <label htmlFor="kitchen-pass">Password</label>
              <input
                id="kitchen-pass"
                type="password"
                autoComplete="off"
                value={kitchen.password}
                onChange={(e) => setKitchen((g) => ({ ...g, password: e.target.value }))}
              />
            </div>
            <div className="login-field">
              <label htmlFor="kitchen-device">Device ID</label>
              <input
                id="kitchen-device"
                type="text"
                autoComplete="off"
                value={kitchen.deviceId}
                onChange={(e) => setKitchen((g) => ({ ...g, deviceId: e.target.value }))}
              />
            </div>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Continue to kitchen"}
            </button>
          </form>
        )}

        <footer className="login-footer">
          <span>Session is saved after login and reused for WebSocket auth.</span>
        </footer>
      </div>
    </div>
  );
}

