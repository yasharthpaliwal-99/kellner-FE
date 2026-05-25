import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { MenuSuggestion, OrderSuggestionsPayload } from "../types";
import { VoiceOrb } from "../components/VoiceOrb";
import { MenuSuggestionCards } from "../components/MenuSuggestionCards";
import { GuestSpotlightRails } from "../components/GuestSpotlightRails";
import { KellnerVoicePanel } from "../components/KellnerVoicePanel";
import { FullMenuModal } from "../components/FullMenuModal";
import { DishSpiceSlider } from "../components/DishSpiceSlider";
import { formatAmount, asAmount } from "../lib/formatAmount";
import { spiceToSliderIndex, sliderIndexToSpice, normalizeSpiceLevel } from "../lib/orderSpice";
import {
  appendServiceRequest,
  tableContextFromSession,
  updateDishSpiceLevel,
} from "../lib/tableOrderApi";
import "./GuestVoicePage.css";

type GuestVoiceLocationState = { startVoiceSession?: boolean };
type ReplyMode = "none" | "bill" | "order_confirmation" | "recommendations";
type StructuredItem = {
  name?: string;
  quantity?: number | string | null;
  price?: number | string | null;
  amount?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  line_id?: string | null;
  spice_level?: string | null;
};
type BillPayload = {
  items?: StructuredItem[];
  total?: number | string | null;
  subtotal?: number | string | null;
  service_charge_percent?: number | string | null;
  service_charge_amount?: number | string | null;
  gst_percent?: number | string | null;
  gst_amount?: number | string | null;
  grand_total?: number | string | null;
  currency?: string | null;
};
type OrderPayload = { items?: StructuredItem[] };

function asNumber(v: unknown): number | null {
  return asAmount(v);
}

function formatMoney(v: number | null): string {
  return formatAmount(v);
}

export default function GuestVoicePage() {
  const location = useLocation();
  const autoStartVoiceSession =
    (location.state as GuestVoiceLocationState | null)?.startVoiceSession === true;
  const [suggestions, setSuggestions] = useState<MenuSuggestion[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  /** Post–place_order pairing rail (`order_suggestions`); separate from menu recommendations. */
  const [orderPairing, setOrderPairing] = useState<OrderSuggestionsPayload | null>(null);
  const [micLive, setMicLive] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Connecting…");
  const [audioBands, setAudioBands] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [replyMode, setReplyMode] = useState<ReplyMode>("none");
  const [structuredPayload, setStructuredPayload] = useState<unknown>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [spiceBusyLineKey, setSpiceBusyLineKey] = useState<string | null>(null);
  /** Row key → slider 1–4 */
  const [guestLineSpice, setGuestLineSpice] = useState<Record<string, number>>({});
  const savedLineSpiceRef = useRef<Record<string, number>>({});
  const [hintTone, setHintTone] = useState<"error" | "success">("error");
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tableCtx = tableContextFromSession();
  const spotlightHotelId = tableCtx?.hotel_id ?? NaN;

  const showActionHint = useCallback((message: string, tone: "error" | "success" = "error", ms = 3200) => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setHintTone(tone);
    setActionHint(message);
    hintTimerRef.current = setTimeout(() => {
      setActionHint(null);
      hintTimerRef.current = null;
    }, ms);
  }, []);

  const sendTableNote = async (text: string) => {
    if (!tableCtx) {
      showActionHint("Missing table session — log in again as a device.", "error");
      return;
    }
    setRequestBusy(true);
    try {
      await appendServiceRequest(tableCtx, text);
      showActionHint("Request sent.", "success");
    } catch (e) {
      showActionHint(e instanceof Error ? e.message : "Could not send request.", "error");
    } finally {
      setRequestBusy(false);
    }
  };

  function sliderFromStructuredItem(it: StructuredItem): number | null {
    const level = normalizeSpiceLevel(it.spice_level);
    return level ? spiceToSliderIndex(level) : null;
  }

  const commitLineSpice = async (lineKey: string, dishName: string, level: number) => {
    const trimmed = dishName.trim();
    if (!tableCtx) {
      showActionHint("Missing table session — log in again as a device.", "error");
      return;
    }
    if (!trimmed) return;

    const prevSaved = savedLineSpiceRef.current[lineKey];
    if (level === prevSaved) return;

    setSpiceBusyLineKey(lineKey);
    try {
      await updateDishSpiceLevel({
        hotel_id: tableCtx.hotel_id,
        table_number: tableCtx.table_number,
        dish_name: trimmed,
        spice_level: sliderIndexToSpice(level),
      });
      savedLineSpiceRef.current[lineKey] = level;
      setGuestLineSpice((p) => ({ ...p, [lineKey]: level }));
      showActionHint("Spice level saved.", "success");
    } catch (e) {
      const revert = prevSaved ?? 3;
      setGuestLineSpice((p) => ({ ...p, [lineKey]: revert }));
      showActionHint(e instanceof Error ? e.message : "Could not save spice level.", "error");
    } finally {
      setSpiceBusyLineKey(null);
    }
  };

  const emptySuggestionMessage = "Hang on while we get the magic done.";

  const panelTitle =
    replyMode === "order_confirmation"
      ? "Current order"
      : replyMode === "bill"
        ? "Bill"
        : "Info Board";

  const orderItems = Array.isArray((structuredPayload as OrderPayload | null)?.items)
    ? ((structuredPayload as OrderPayload).items as StructuredItem[])
    : [];

  const billPayload = (structuredPayload as BillPayload | null) ?? {};
  const billItems = Array.isArray(billPayload.items) ? billPayload.items : [];
  const billSubtotal = asNumber(billPayload.subtotal);
  const serviceChargePercent = asNumber(billPayload.service_charge_percent);
  const serviceChargeAmount = asNumber(billPayload.service_charge_amount);
  const gstPercent = asNumber(billPayload.gst_percent);
  const gstAmount = asNumber(billPayload.gst_amount);
  const billTotal = asNumber(billPayload.total) ?? asNumber(billPayload.grand_total);

  const showOrderCard = replyMode === "order_confirmation" && orderItems.length > 0;
  const showBillCard = replyMode === "bill" && (billItems.length > 0 || billTotal != null);
  const showOrderPairing = Boolean(orderPairing?.items.length);
  const showMenuRecommendations = !showOrderCard && !showBillCard;
  const showVoiceRecommendations =
    showMenuRecommendations && (recommendationsLoading || suggestions.length > 0);
  /** Spotlights only on idle INFO BOARD — hide once the guest asks / recommendations flow starts. */
  const showSpotlightRails =
    showMenuRecommendations &&
    Number.isFinite(spotlightHotelId) &&
    !showVoiceRecommendations &&
    !showOrderPairing;

  const orderFingerprint = useMemo(() => {
    if (replyMode !== "order_confirmation") return "";
    const items = Array.isArray((structuredPayload as OrderPayload | null)?.items)
      ? ((structuredPayload as OrderPayload).items as StructuredItem[])
      : [];
    if (!items.length) return "";
    return JSON.stringify(items.map((i) => [i.name, i.quantity, i.line_id ?? null]));
  }, [replyMode, structuredPayload]);

  useEffect(() => {
    if (!orderFingerprint) {
      setGuestLineSpice({});
      savedLineSpiceRef.current = {};
      return;
    }
    const items = Array.isArray((structuredPayload as OrderPayload)?.items)
      ? ((structuredPayload as OrderPayload).items as StructuredItem[])
      : [];
    const next: Record<string, number> = {};
    const saved: Record<string, number> = {};
    items.forEach((it, idx) => {
      const lineKey = it.line_id?.trim() || `idx-${idx}`;
      const dishName = (it.name ?? "Item").trim();
      const fromVoice = sliderFromStructuredItem(it);
      const fromSaved = savedLineSpiceRef.current[lineKey];
      const v = fromVoice ?? fromSaved ?? 3;
      next[lineKey] = v;
      saved[lineKey] = v;
    });
    setGuestLineSpice(next);
    savedLineSpiceRef.current = saved;
  }, [orderFingerprint, structuredPayload]);

  return (
    <div className="guest-page">
      <header className="guest-header">
        <div className="guest-brand">
          <img
            className="guest-brand-logo"
            src="/real.png"
            alt="Kellner"
          />
        </div>
        <div className="guest-header-actions">
          <button
            className="guest-view-menu-btn"
            type="button"
            onClick={() => setMenuOpen(true)}
          >
            <svg
              className="guest-action-btn-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="14" y2="17" />
            </svg>
            <span className="guest-action-btn-label">View full menu</span>
          </button>

          <button
            className="guest-action-btn"
            type="button"
            aria-label="Request cutlery"
            title="Request cutlery"
            disabled={requestBusy}
            onClick={() => void sendTableNote("Extra cutlery")}
          >
            <svg
              className="guest-action-btn-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M7 3v18" />
              <path d="M4 3v3a3 3 0 0 0 3 3" />
              <path d="M10 3v3a3 3 0 0 1-3 3" />
              <path d="M16 3c-1.4 0-2 2-2 4s2 4 2 4v10" />
            </svg>
            <span className="guest-action-btn-label">Request cutlery</span>
          </button>

          <button
            className="guest-action-btn"
            type="button"
            aria-label="Request table cleanup"
            title="Request table cleanup"
            disabled={requestBusy}
            onClick={() => void sendTableNote("Table cleanup")}
          >
            <svg
              className="guest-action-btn-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v3" />
              <path d="M5.6 5.6l2.1 2.1" />
              <path d="M3 12h3" />
              <path d="M5.6 18.4l2.1-2.1" />
              <path d="M18.4 5.6l-2.1 2.1" />
              <path d="M21 12h-3" />
              <circle cx="14" cy="14" r="4" />
              <path d="M11.5 16.5l-3 3" />
            </svg>
            <span className="guest-action-btn-label">Table cleanup</span>
          </button>

        </div>
      </header>

      {actionHint ? (
        <p
          className={`guest-action-hint${hintTone === "success" ? " is-success" : ""}`}
          role="status"
        >
          {actionHint}
        </p>
      ) : null}

      <main className="guest-main">
        <section className="guest-hero" aria-label="Voice assistant">
          <div className="guest-orb-stack">
            <VoiceOrb
              state={micLive ? "listening" : "idle"}
              size="compact"
              tone="mono"
              audioBands={audioBands}
            />
            <p className="guest-phase" aria-live="polite">
              {phaseLabel}
            </p>
          </div>

          <KellnerVoicePanel
            variant="guest"
            autoStartVoiceSession={autoStartVoiceSession}
            onRecommendations={(items) => {
              setSuggestions(items);
            }}
            onRecommendationsLoadingChange={setRecommendationsLoading}
            onReplyModeChange={(mode) => {
              setReplyMode(mode);
              if (mode === "none") setStructuredPayload(null);
              if (mode === "recommendations" || mode === "bill") setOrderPairing(null);
            }}
            onStructuredPayload={(mode, payload) => {
              setReplyMode(mode);
              setStructuredPayload(payload);
            }}
            onOrderSuggestions={(event) => {
              setOrderPairing(event.payload);
            }}
            onUserTranscript={() => {
              setOrderPairing(null);
              setSuggestions([]);
            }}
            onVoiceActiveChange={setMicLive}
            onPhaseLabelChange={setPhaseLabel}
            onAudioBands={setAudioBands}
          />
        </section>

        <aside className="guest-suggestions" aria-label="Suggestions from your assistant">
          <div className="guest-suggestions-titlebar">
            <h2 className="guest-suggestions-title">{panelTitle}</h2>
          </div>
          <div className="guest-suggestions-panel">
          {showOrderCard ? (
            <article className="guest-structured-card" aria-live="polite">
              <header className="guest-structured-head">
                <span>Item name</span>
                <span>Quantity</span>
              </header>
              <ul className="guest-structured-list">
                {orderItems.map((it, idx) => {
                  const quantity = asNumber(it.quantity) ?? 1;
                  const lineKey = it.line_id?.trim() || `idx-${idx}`;
                  const dishName = (it.name ?? "Item").trim();
                  const spiceVal = guestLineSpice[lineKey] ?? 3;
                  return (
                    <li
                      className="guest-structured-row guest-structured-row--order-line"
                      key={`${lineKey}-${idx}`}
                    >
                      <div className="guest-structured-row-main">
                        <span className="guest-structured-name">{it.name ?? "Item"}</span>
                        <span className="guest-structured-qty">{quantity}</span>
                      </div>
                      <div className="guest-order-spice-wrap">
                        <DishSpiceSlider
                          value={spiceVal}
                          disabled={
                            !tableCtx || spiceBusyLineKey === lineKey || requestBusy
                          }
                          onChange={(level) =>
                            setGuestLineSpice((p) => ({ ...p, [lineKey]: level }))
                          }
                          onCommit={(level) => void commitLineSpice(lineKey, dishName, level)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          ) : showBillCard ? (
            <article className="guest-structured-card guest-structured-card--bill" aria-live="polite">
              <header className="guest-structured-head guest-structured-head--bill">
                <span>Item</span>
                <span>Quantity</span>
                <span>Amount</span>
              </header>
              <ul className="guest-structured-list">
                {billItems.map((it, idx) => {
                  const quantity = asNumber(it.quantity) ?? 1;
                  const amount = asNumber(it.amount);
                  const lineTotalFromPayload = asNumber(it.line_total);
                  const unitPrice = asNumber(it.unit_price) ?? asNumber(it.price);
                  const lineTotal =
                    amount ??
                    lineTotalFromPayload ??
                    (unitPrice == null ? null : unitPrice * quantity);
                  return (
                    <li className="guest-structured-row guest-structured-row--bill" key={`${it.name ?? "item"}-${idx}`}>
                      <span className="guest-structured-name">{it.name ?? "Item"}</span>
                      <span className="guest-structured-qty">{quantity}</span>
                      <span className="guest-structured-qty">{formatMoney(lineTotal)}</span>
                    </li>
                  );
                })}
              </ul>
              {billSubtotal != null ? (
                <div className="guest-structured-meta-row">
                  <span>Subtotal</span>
                  <strong>{formatMoney(billSubtotal)}</strong>
                </div>
              ) : null}
              {serviceChargeAmount != null ? (
                <div className="guest-structured-meta-row">
                  <span>
                    Service charge
                    {serviceChargePercent != null ? ` (${serviceChargePercent}%)` : ""}
                  </span>
                  <strong>{formatMoney(serviceChargeAmount)}</strong>
                </div>
              ) : null}
              {gstAmount != null ? (
                <div className="guest-structured-meta-row">
                  <span>
                    GST
                    {gstPercent != null ? ` (${gstPercent}%)` : ""}
                  </span>
                  <strong>{formatMoney(gstAmount)}</strong>
                </div>
              ) : null}
              <footer className="guest-structured-foot guest-structured-foot--bill">
                <span className="guest-structured-foot-label">Total</span>
                <strong>{formatMoney(billTotal)}</strong>
              </footer>
            </article>
          ) : showMenuRecommendations ? (
            <>
              {showSpotlightRails ? (
                <GuestSpotlightRails
                  hotelId={spotlightHotelId}
                  variant="info-board"
                />
              ) : null}
              {showVoiceRecommendations ? (
                <MenuSuggestionCards
                  items={suggestions}
                  loading={recommendationsLoading}
                  emptyMessage={emptySuggestionMessage}
                />
              ) : !showSpotlightRails ? (
                <MenuSuggestionCards
                  items={[]}
                  loading={false}
                  emptyMessage={emptySuggestionMessage}
                />
              ) : null}
            </>
          ) : null}
          {showOrderPairing && orderPairing ? (
            <section
              className="guest-order-pairing"
              aria-label={orderPairing.title}
              aria-live="polite"
            >
              <h3 className="guest-order-pairing-title">{orderPairing.title}</h3>
              <p className="guest-order-pairing-hint">Say a dish name to add it to your order</p>
              <MenuSuggestionCards items={orderPairing.items} loading={false} />
            </section>
          ) : null}
          </div>
        </aside>
      </main>
      <FullMenuModal open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}