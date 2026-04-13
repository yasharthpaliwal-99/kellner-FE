import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/api";
import { getAuthSession } from "../lib/authSession";
import type { KitchenMenuItem } from "../types";
import "./MenuView.css";

type Props = {
  hotelId: string;
  /** Increment from parent when user taps Refresh while Menu tab is active. */
  reloadToken: number;
};

async function assertOk(r: Response, label: string) {
  if (r.ok) return;
  if ([502, 503, 504].includes(r.status)) {
    throw new Error("Failed to fetch");
  }
  const j = (await r.json().catch(() => ({}))) as { error?: string; detail?: unknown };
  const fromServer = typeof j.error === "string" ? j.error.trim() : "";
  throw new Error(fromServer || `${label} (${r.status})`);
}

function assertBodyOk(data: Record<string, unknown>, label: string) {
  if (data.ok === false) {
    const msg =
      (typeof data.error === "string" && data.error.trim()) ||
      (typeof data.message === "string" && data.message.trim()) ||
      label;
    throw new Error(msg);
  }
}

function authHeaders(): HeadersInit {
  const session = getAuthSession();
  const h: Record<string, string> = {};
  if (session?.session_id) {
    h["x-device-session"] = session.session_id;
  }
  return h;
}

function normalizeRow(row: unknown): KitchenMenuItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const dish_id = Number(r.dish_id);
  if (!Number.isFinite(dish_id)) return null;
  const name = String(r.name ?? "Item").trim() || "Item";
  const rawPrice = r.price;
  let price: number | null = null;
  if (rawPrice != null && rawPrice !== "") {
    const n = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
    price = Number.isFinite(n) ? n : null;
  }
  const available = Boolean(r.available);
  return { dish_id, name, price, available };
}

/** `fetch_menu` response: `{ ok, hotel_id, items: [...] }` */
function parseFetchMenuItems(data: unknown): KitchenMenuItem[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const raw = o.items;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRow).filter((x): x is KitchenMenuItem => x !== null);
}

function formatPrice(price: number | null) {
  if (price == null || !Number.isFinite(price)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(price);
  } catch {
    return String(price);
  }
}

function snapshotAvailable(items: KitchenMenuItem[]): string {
  return JSON.stringify(
    [...items]
      .sort((a, b) => a.dish_id - b.dish_id)
      .map((i) => ({ dish_id: i.dish_id, available: i.available }))
  );
}

export function MenuView({ hotelId, reloadToken }: Props) {
  const [items, setItems] = useState<KitchenMenuItem[]>([]);
  const [baseline, setBaseline] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const loadMenu = useCallback(async () => {
    setError(null);
    setSaveOk(null);
    setLoading(true);
    try {
      const hid = Number(hotelId);
      if (!Number.isFinite(hid)) throw new Error("Invalid hotel id");
      const r = await fetch(apiUrl("/api/kitchen/fetch_menu"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ hotel_id: hid }),
      });
      await assertOk(r, "Could not load menu");
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      assertBodyOk(data, "Could not load menu");
      const next = parseFetchMenuItems(data);
      setItems(next);
      setBaseline(snapshotAvailable(next));
    } catch (e) {
      setItems([]);
      setBaseline("");
      setError(e instanceof Error ? e.message : "Could not load menu");
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu, reloadToken]);

  const dirty = useMemo(() => snapshotAvailable(items) !== baseline, [items, baseline]);

  const setAvailable = (dishId: number, available: boolean) => {
    setSaveOk(null);
    setItems((prev) => prev.map((row) => (row.dish_id === dishId ? { ...row, available } : row)));
  };

  const save = async () => {
    setError(null);
    setSaveOk(null);
    setSaving(true);
    try {
      const hid = Number(hotelId);
      if (!Number.isFinite(hid)) throw new Error("Invalid hotel id");
      const r = await fetch(apiUrl("/api/kitchen/save_menu"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          hotel_id: hid,
          items: items.map((i) => ({
            dish_id: i.dish_id,
            available: i.available,
          })),
        }),
      });
      await assertOk(r, "Could not save menu");
      const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      assertBodyOk(data, "Could not save menu");
      const updated = Array.isArray(data.updated) ? data.updated.length : 0;
      const failed = Array.isArray(data.failed) ? data.failed.length : 0;
      setBaseline(snapshotAvailable(items));
      setSaveOk(
        failed > 0
          ? `Saved: ${updated} updated, ${failed} failed.`
          : updated > 0
            ? `Saved: ${updated} updated.`
            : "Menu saved."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="menu-view">
      <div className="menu-view-head">
        <div>
          <h2 className="menu-view-title">Menu</h2>
          <p className="menu-view-sub">Toggle availability and save when you are done.</p>
        </div>
        <button
          type="button"
          className="menu-view-save"
          disabled={!dirty || saving || loading}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {error ? (
        <p className="menu-view-error" role="alert">
          {error}
        </p>
      ) : null}
      {saveOk ? (
        <p className="menu-view-success" role="status">
          {saveOk}
        </p>
      ) : null}

      {loading ? <p className="menu-view-muted">Loading menu…</p> : null}
      {!loading && !items.length && !error ? (
        <p className="menu-view-muted">No dishes returned for this hotel.</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="menu-table-wrap">
          <table className="menu-table">
            <thead>
              <tr>
                <th scope="col">Dish</th>
                <th scope="col">ID</th>
                <th scope="col">Price</th>
                <th scope="col">Available</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.dish_id}>
                  <td className="menu-col-name">{row.name}</td>
                  <td className="menu-col-id">{row.dish_id}</td>
                  <td className="menu-col-price">{formatPrice(row.price)}</td>
                  <td className="menu-col-toggle">
                    <label className="menu-toggle">
                      <input
                        type="checkbox"
                        checked={row.available}
                        onChange={(e) => setAvailable(row.dish_id, e.target.checked)}
                      />
                      <span className="menu-toggle-ui" aria-hidden />
                      <span className="sr-only">
                        {row.available ? "Available" : "Unavailable"} — {row.name}
                      </span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
