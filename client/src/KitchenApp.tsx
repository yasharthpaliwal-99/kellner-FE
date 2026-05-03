import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { KitchenNavTab, KitchenStats, Order } from "./types";
import { apiUrl } from "./lib/api";
import { getAuthSession } from "./lib/authSession";
import { Nav } from "./components/Nav";
import { HomeView } from "./components/HomeView";
import { OrderListView } from "./components/OrderListView";
import { MenuView } from "./components/MenuView";
import "./App.css";

const POLL_MS = 12_000;

function getKitchenHotelId(): string | null {
  // 1) Logged-in session (source of truth)
  const sessionHotel = getAuthSession()?.hotel_id;
  if (typeof sessionHotel === "number" && Number.isFinite(sessionHotel)) {
    return String(sessionHotel);
  }
  if (typeof sessionHotel === "string" && sessionHotel.trim()) {
    return sessionHotel.trim();
  }
  // 2) URL override (manual debugging)
  const q = new URLSearchParams(window.location.search).get("hotel_id");
  if (q?.trim()) return q.trim();
  // 3) Env fallback
  const v = import.meta.env.VITE_HOTEL_ID;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** Optional YYYY-MM-DD — same filter as GET /api/kitchen?date= */
function getKitchenDateQuery(): string | null {
  const q = new URLSearchParams(window.location.search).get("date");
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return null;
}

/** Vite proxy returns 502/503/504 when FastAPI (e.g. :8000) is down — fetch still "succeeds", so treat as unreachable API. */
async function assertOk(r: Response, label: string) {
  if (r.ok) return;
  if ([502, 503, 504].includes(r.status)) {
    throw new Error("Failed to fetch");
  }
  const j = (await r.json().catch(() => ({}))) as { error?: string; hint?: string };
  const hint = typeof j.hint === "string" ? j.hint.trim() : "";
  const fromServer = typeof j.error === "string" ? j.error.trim() : "";
  const head = fromServer || `${label} (${r.status})`;
  throw new Error(hint ? `${head} — ${hint}` : head);
}

export default function KitchenApp() {
  const [tab, setTab] = useState<KitchenNavTab>("home");
  const [menuReloadToken, setMenuReloadToken] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<KitchenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadKitchen = useCallback(async () => {
    const hid = getKitchenHotelId();
    if (!hid) {
      setOrders([]);
      setStats(null);
      throw new Error(
        "Missing hotel: add ?hotel_id=… to the URL or set VITE_HOTEL_ID in client/.env"
      );
    }
    const params = new URLSearchParams({ hotel_id: hid });
    const d = getKitchenDateQuery();
    if (d) params.set("date", d);
    const r = await fetch(apiUrl(`/api/kitchen?${params.toString()}`));
    await assertOk(r, "Could not load kitchen");
    const data = await r.json();
    setOrders(data.orders ?? []);
    setStats(data.stats ?? null);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await loadKitchen();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const isNetwork =
        raw.includes("Failed to fetch") ||
        raw.includes("NetworkError") ||
        raw.includes("Load failed");
      setError(
        isNetwork
          ? "Cannot reach the Python API. Start Kellner: uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 (or the port in VITE_KELLNER_API_PORT). Then run npm run dev for the UI."
          : raw
      );
    } finally {
      setLoading(false);
    }
  }, [loadKitchen]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleHeaderRefresh = () => {
    void refresh();
    if (tab === "menu") {
      setMenuReloadToken((n) => n + 1);
    }
  };

  const kitchenHotelId = getKitchenHotelId();

  const updateStatus = async (orderId: string, status: string) => {
    const r = await fetch(apiUrl(`/api/orders/${orderId}/status`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || "Update failed");
    }
    await refresh();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img
            className="brand-logo"
            src="/kellnerlogo.jpg"
            alt="Kellner — Order smarter"
          />
          <p className="brand-sub">Kitchen display</p>
        </div>
        <button type="button" className="btn-refresh" onClick={handleHeaderRefresh} disabled={loading}>
          Refresh
        </button>
      </header>

      <Nav active={tab} onChange={setTab} />

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
          {!/Cannot reach the Python API|Failed to fetch|NetworkError|Load failed/i.test(error) &&
            !/ — /.test(error) && (
            <span className="banner-hint">
              If the API is already running, check MongoDB / env on the backend and that{" "}
              <code>GET /api/kitchen</code> returns the expected shape.
            </span>
          )}
        </div>
      )}

      <main className="main">
        {tab === "home" && (
          <HomeView stats={stats} loading={loading} orders={orders} />
        )}
        {tab === "orders" && (
          <OrderListView
            orders={orders}
            loading={loading}
            onUpdateStatus={updateStatus}
          />
        )}
        {tab === "menu" && kitchenHotelId && (
          <MenuView hotelId={kitchenHotelId} reloadToken={menuReloadToken} />
        )}
        {tab === "menu" && !kitchenHotelId && (
          <p className="muted">Missing hotel: add ?hotel_id=… to the URL or set VITE_HOTEL_ID in client/.env</p>
        )}
      </main>

      <p className="staff-footer">
        <Link to="/">Customer experience</Link>
      </p>
    </div>
  );
}
