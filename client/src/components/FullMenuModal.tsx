import { useEffect, useMemo, useRef, useState } from "react";
import type { KitchenMenuItem } from "../types";
import { apiUrl } from "../lib/api";
import { formatAmount } from "../lib/formatAmount";
import { getAuthSession } from "../lib/authSession";
import "./FullMenuModal.css";

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
  const chef_special = Boolean(r.chef_special);
  const todays_special = Boolean(r.todays_special);
  const must_try = Boolean(r.must_try);

  const rawImg = r.image;
  const image = typeof rawImg === "string" && rawImg.trim() ? rawImg.trim() : null;

  const sectionCandidates = [
    r.section,
    r.category,
    r.group,
    r.menu_section,
    r.category_name,
    r.section_name,
  ];
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
    chef_special,
    todays_special,
    must_try,
    ...(image ? { image } : {}),
    ...(section ? { section } : {}),
  };
}

function parseFetchMenuItems(data: unknown): KitchenMenuItem[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const raw = Array.isArray(o.items) ? o.items : Array.isArray(data) ? data : [];
  return raw.map(normalizeRow).filter((x): x is KitchenMenuItem => x !== null);
}

/** Section tabs from API list and/or per-item fields (preserves API order when provided). */
function parseSectionLabels(data: unknown, items: KitchenMenuItem[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const s = label.trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    ordered.push(s);
  };

  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const raw = o.sections ?? o.categories ?? o.menu_sections;
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === "string") add(entry);
        else if (entry && typeof entry === "object") {
          const name = (entry as Record<string, unknown>).name ?? (entry as Record<string, unknown>).title;
          if (typeof name === "string") add(name);
        }
      }
    }
  }

  for (const it of items) {
    if (it.section) add(it.section);
  }

  return ordered;
}

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
      </div>
      <div className="fm-card-body">
        <p className="fm-card-name">{item.name}</p>
        <p className="fm-card-price">{formatAmount(item.price)}</p>
      </div>
    </article>
  );
}

const ALL_SECTIONS = "__all__";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FetchState = "idle" | "loading" | "error";

export function FullMenuModal({ open, onClose }: Props) {
  const [items, setItems] = useState<KitchenMenuItem[]>([]);
  const [sectionLabels, setSectionLabels] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [activeSection, setActiveSection] = useState<string>(ALL_SECTIONS);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

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
        const nextItems = parseFetchMenuItems(data);
        setItems(nextItems);
        setSectionLabels(parseSectionLabels(data, nextItems));
        setFetchState("idle");
        setActiveSection(ALL_SECTIONS);
      })
      .catch(() => setFetchState("error"));
  }, [open]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  const sections = sectionLabels;

  const filteredItems = useMemo(() => {
    if (activeSection === ALL_SECTIONS) return items;
    return items.filter((it) => (it.section ?? "") === activeSection);
  }, [items, activeSection]);

  const sortedItems = useMemo(() => {
    const available = filteredItems.filter((it) => it.available);
    const unavailable = filteredItems.filter((it) => !it.available);
    return [...available, ...unavailable];
  }, [filteredItems]);

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
          <button
            className="fm-close-btn"
            aria-label="Close menu"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden>✕</span>
          </button>
        </header>

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

          {fetchState === "idle" && sortedItems.length === 0 && (
            <div className="fm-state-wrap" aria-live="polite">
              <p className="fm-state-text">
                {activeSection !== ALL_SECTIONS
                  ? "No dishes in this category."
                  : "No items on the menu yet."}
              </p>
            </div>
          )}

          {fetchState === "idle" && sortedItems.length > 0 && (
            <div className="fm-grid">
              {sortedItems.map((item) => (
                <MenuItemCard key={item.dish_id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
