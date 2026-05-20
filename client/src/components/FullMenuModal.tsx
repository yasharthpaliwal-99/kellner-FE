import { useEffect, useMemo, useRef, useState } from "react";
import type { KitchenMenuItem } from "../types";
import { apiUrl } from "../lib/api";
import { formatAmount } from "../lib/formatAmount";
import { getAuthSession } from "../lib/authSession";
import "./FullMenuModal.css";

/* ───────────────────────── helpers ───────────────────────── */

/**
 * Mirror of `MenuView.normalizeRow` (kitchen side), with two extra optional
 * fields surfaced for the guest UI — `description` and `section`/`category`.
 * Same `fetch_menu` payload, so any extras the backend already returns flow
 * through transparently; missing fields just stay null.
 */
function normalizeRow(row: unknown): KitchenMenuItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const dish_id = Number(r.dish_id);
  if (!Number.isFinite(dish_id)) return null;
  const name = String(r.name ?? "Item").trim() || "Item";

  const rawPrice = r.price;
  let price: number | string | null = null;
  if (rawPrice != null && rawPrice !== "") {
    const n = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
    price = Number.isFinite(n) ? n : null;
  }

  const available = Boolean(r.available);

  const rawImg = r.image;
  const image = typeof rawImg === "string" && rawImg.trim() ? rawImg.trim() : null;

  // Backend may use any of these; pick the first non-empty string.
  const descCandidates = [r.description, r.desc, r.info];
  let description: string | null = null;
  for (const c of descCandidates) {
    if (typeof c === "string" && c.trim()) {
      description = c.trim();
      break;
    }
  }

  const sectionCandidates = [r.section, r.category, r.group];
  let section: string | null = null;
  for (const c of sectionCandidates) {
    if (typeof c === "string" && c.trim()) {
      section = c.trim();
      break;
    }
  }

  return {
    dish_id,
    name,
    price,
    available,
    ...(image ? { image } : {}),
    ...(description ? { description } : {}),
    ...(section ? { section } : {}),
  };
}

function parseFetchMenuItems(data: unknown): KitchenMenuItem[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const raw = Array.isArray(o.items) ? o.items : Array.isArray(data) ? data : [];
  return raw.map(normalizeRow).filter((x): x is KitchenMenuItem => x !== null);
}

/* ───────────────────────── card ───────────────────────── */

type MenuCardProps = { item: KitchenMenuItem };

function MenuItemCard({ item }: MenuCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = item.image?.trim();
  const showPhoto = Boolean(url) && !imgFailed;

  return (
    <article className={`fm-card${item.available ? "" : " fm-card--unavailable"}`}>
      <div className="fm-card-media">
        {showPhoto ? (
          <img
            className="fm-card-img"
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="fm-card-img-placeholder" aria-hidden>
            <span className="fm-card-placeholder-glyph" />
          </div>
        )}
        {!item.available && (
          <span className="fm-card-unavailable-badge" aria-label="Unavailable">
            Unavailable
          </span>
        )}
      </div>
      <div className="fm-card-body">
        <header className="fm-card-head">
          <p className="fm-card-name">{item.name}</p>
          <p className="fm-card-price">{formatAmount(item.price)}</p>
        </header>
        {item.description ? (
          <p className="fm-card-desc">{item.description}</p>
        ) : null}
      </div>
    </article>
  );
}

/* ───────────────────────── modal ───────────────────────── */

const ALL_SECTIONS = "__all__";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FetchState = "idle" | "loading" | "error";

export function FullMenuModal({ open, onClose }: Props) {
  const [items, setItems] = useState<KitchenMenuItem[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string>(ALL_SECTIONS);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // open / close native dialog
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else {
      if (el.open) el.close();
    }
  }, [open]);

  // close on ESC (native dialog fires "close")
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  // fetch menu when opened (same shape as kitchen MenuView)
  useEffect(() => {
    if (!open) return;
    setFetchState("loading");
    const session = getAuthSession();
    const hid = Number(session?.hotel_id);
    if (!Number.isFinite(hid)) {
      setItems([]);
      setFetchState("error");
      return;
    }
    // NOTE: guest reads the menu anonymously — `hotel_id` in body is enough.
    // We deliberately do NOT send `x-device-session` here: the kitchen endpoint
    // rejects device sessions with 401, and we don't need auth to surface the
    // public menu to a diner.
    fetch(apiUrl("/api/kitchen/fetch_menu"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotel_id: hid }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        setItems(parseFetchMenuItems(data));
        setFetchState("idle");
        // reset filters when a fresh menu loads
        setActiveSection(ALL_SECTIONS);
        setSearch("");
      })
      .catch(() => setFetchState("error"));
  }, [open]);

  // close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  /** Unique section names preserved in first-seen order. */
  const sections = useMemo(() => {
    const seen: string[] = [];
    const set = new Set<string>();
    for (const it of items) {
      const s = it.section?.trim();
      if (s && !set.has(s)) {
        set.add(s);
        seen.push(s);
      }
    }
    return seen;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (activeSection !== ALL_SECTIONS) {
        if ((it.section ?? "") !== activeSection) return false;
      }
      if (q) {
        const hay = `${it.name} ${it.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, activeSection]);

  const availableItems = filteredItems.filter((it) => it.available);
  const unavailableItems = filteredItems.filter((it) => !it.available);

  return (
    <dialog
      ref={dialogRef}
      className="fm-dialog"
      aria-label="Full menu"
      onClick={handleBackdropClick}
    >
      <div className="fm-sheet">
        <header className="fm-header">
          <h2 className="fm-title">Menu</h2>
          <div className="fm-header-tools">
            <input
              className="fm-search"
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search menu"
            />
            <button
              className="fm-close-btn"
              aria-label="Close menu"
              onClick={onClose}
              type="button"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
        </header>

        {sections.length > 0 ? (
          <nav className="fm-filterbar" aria-label="Menu sections">
            <button
              type="button"
              className={`fm-chip${activeSection === ALL_SECTIONS ? " is-active" : ""}`}
              onClick={() => setActiveSection(ALL_SECTIONS)}
            >
              All
            </button>
            {sections.map((s) => (
              <button
                key={s}
                type="button"
                className={`fm-chip${activeSection === s ? " is-active" : ""}`}
                onClick={() => setActiveSection(s)}
              >
                {s}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="fm-body">
          {fetchState === "loading" && (
            <div className="fm-state-wrap" aria-live="polite">
              <div className="fm-spinner" aria-hidden />
              <p className="fm-state-text">Loading menu…</p>
            </div>
          )}

          {fetchState === "error" && (
            <div className="fm-state-wrap" aria-live="assertive">
              <p className="fm-state-text fm-state-text--error">
                Could not load the menu. Please try again.
              </p>
            </div>
          )}

          {fetchState === "idle" && filteredItems.length === 0 && (
            <div className="fm-state-wrap" aria-live="polite">
              <p className="fm-state-text">
                {search.trim() || activeSection !== ALL_SECTIONS
                  ? "No dishes match your filters."
                  : "No items on the menu yet."}
              </p>
            </div>
          )}

          {fetchState === "idle" && availableItems.length > 0 && (
            <section>
              <div className="fm-grid">
                {availableItems.map((item) => (
                  <MenuItemCard key={item.dish_id} item={item} />
                ))}
              </div>
            </section>
          )}

          {fetchState === "idle" && unavailableItems.length > 0 && (
            <section className="fm-unavailable-section">
              <h3 className="fm-section-label">Currently unavailable</h3>
              <div className="fm-grid">
                {unavailableItems.map((item) => (
                  <MenuItemCard key={item.dish_id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
