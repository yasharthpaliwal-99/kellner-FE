import { useEffect, useState } from "react";
import { fetchMenuSpotlights } from "../lib/menuSpotlights";
import { formatAmount } from "../lib/formatAmount";
import type { MenuSpotlightItem } from "../types";
import "./GuestSpotlightRails.css";

type Props = {
  hotelId: number;
  /** Tighter layout for GuestVoicePage INFO BOARD column. */
  variant?: "default" | "info-board";
};

function SpotlightCard({ item }: { item: MenuSpotlightItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = item.image?.trim();
  const showPhoto = Boolean(url) && !imgFailed;

  return (
    <article className="guest-spotlight-card" aria-label={item.name}>
      <div className="guest-spotlight-card-media">
        {showPhoto ? (
          <img
            className="guest-spotlight-card-img"
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="guest-spotlight-card-placeholder" aria-hidden />
        )}
      </div>
      <div className="guest-spotlight-card-body">
        <div className="guest-spotlight-card-head">
          <h3 className="guest-spotlight-card-name">{item.name}</h3>
          <span className="guest-spotlight-card-price">{formatAmount(item.price)}</span>
        </div>
      </div>
    </article>
  );
}

export function GuestSpotlightRails({ hotelId, variant = "default" }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rails, setRails] = useState<Awaited<ReturnType<typeof fetchMenuSpotlights>>["rails"]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMenuSpotlights(hotelId)
      .then((res) => {
        if (cancelled) return;
        setRails(res.rails.filter((rail) => rail.items.length > 0));
      })
      .catch((e) => {
        if (cancelled) return;
        setRails([]);
        setError(e instanceof Error ? e.message : "Could not load highlights.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  const rootClass =
    variant === "info-board"
      ? "guest-spotlights guest-spotlights--info-board"
      : "guest-spotlights";

  if (loading) {
    return (
      <div
        className={`${rootClass} guest-spotlights--loading`}
        aria-busy="true"
        aria-label="Loading menu highlights"
      >
        <p className="guest-spotlights-muted">Loading highlights…</p>
      </div>
    );
  }

  if (error || !rails.length) {
    return null;
  }

  return (
    <section className={rootClass} aria-label="Menu highlights">
      {rails.map((rail) => (
        <div key={rail.id} className="guest-spotlight-rail">
          <h2 className="guest-spotlight-rail-title">{rail.title}</h2>
          <div className="guest-spotlight-rail-track" role="list">
            {rail.items.map((item) => (
              <div key={`${rail.id}-${item.dish_id}`} className="guest-spotlight-rail-item" role="listitem">
                <SpotlightCard item={item} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
