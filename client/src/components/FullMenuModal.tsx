import { useEffect, useRef, useState } from "react";
import type { KitchenMenuItem } from "../types";
import { apiUrl } from "../lib/api";
import "./FullMenuModal.css";

function formatPrice(price: number | string | null): string {
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
  } catch {
    return `${n}`;
  }
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
        {!item.available && (
          <span className="fm-card-unavailable-badge" aria-label="Unavailable">
            Unavailable
          </span>
        )}
      </div>
      <div className="fm-card-body">
        <p className="fm-card-name">{item.name}</p>
        <p className="fm-card-price">{formatPrice(item.price)}</p>
      </div>
    </article>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

type FetchState = "idle" | "loading" | "error";

export function FullMenuModal({ open, onClose }: Props) {
  const [items, setItems] = useState<KitchenMenuItem[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [search, setSearch] = useState("");
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

  // fetch menu when opened
  useEffect(() => {
    if (!open) return;
    setFetchState("loading");
    fetch(apiUrl("/api/kitchen/fetch_menu"))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? (data as KitchenMenuItem[]) : [];
        setItems(arr);
        setFetchState("idle");
      })
      .catch(() => {
        setFetchState("error");
      });
  }, [open]);

  // close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  const filteredItems = search.trim()
    ? items.filter((it) =>
        it.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : items;

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
          <button
            className="fm-close-btn"
            aria-label="Close menu"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden>✕</span>
          </button>
        </header>

        <div className="fm-search-wrap">
          <input
            className="fm-search"
            type="search"
            placeholder="Search dishes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search menu"
          />
        </div>

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
                {search.trim() ? "No dishes match your search." : "No items on the menu yet."}
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
