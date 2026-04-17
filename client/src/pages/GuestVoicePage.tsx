import { useState } from "react";
import { useLocation } from "react-router-dom";
import type { MenuSuggestion } from "../types";
import { VoiceOrb } from "../components/VoiceOrb";
import { MenuSuggestionCards } from "../components/MenuSuggestionCards";
import { KellnerVoicePanel } from "../components/KellnerVoicePanel";
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
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatMoney(v: number | null): string {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
  } catch {
    return `${v}`;
  }
}

export default function GuestVoicePage() {
  const location = useLocation();
  const autoStartVoiceSession =
    (location.state as GuestVoiceLocationState | null)?.startVoiceSession === true;
  const [suggestions, setSuggestions] = useState<MenuSuggestion[]>([]);
  const [hasAskedForSuggestions, setHasAskedForSuggestions] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [micLive, setMicLive] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Connecting…");
  const [audioBands, setAudioBands] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [replyMode, setReplyMode] = useState<ReplyMode>("none");
  const [structuredPayload, setStructuredPayload] = useState<unknown>(null);

  const emptySuggestionMessage = hasAskedForSuggestions
    ? "Sorry, we could not find matching suggestions right now."
    : "Ask for dish suggestions to see options.";

  const panelTitle =
    replyMode === "order_confirmation"
      ? "Current order"
      : replyMode === "bill"
        ? "Bill"
        : "Suggestions";

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
      </header>

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
            onRecommendationsLoadingChange={(loading) => {
              if (loading) setHasAskedForSuggestions(true);
              setRecommendationsLoading(loading);
            }}
            onReplyModeChange={(mode) => {
              setReplyMode(mode);
              if (mode === "none") setStructuredPayload(null);
            }}
            onStructuredPayload={(mode, payload) => {
              setReplyMode(mode);
              setStructuredPayload(payload);
            }}
            onVoiceActiveChange={setMicLive}
            onPhaseLabelChange={setPhaseLabel}
            onAudioBands={setAudioBands}
          />
        </section>

        <aside className="guest-suggestions" aria-label="Suggestions from your assistant">
          <h2 className="guest-suggestions-title">{panelTitle}</h2>
          {showOrderCard ? (
            <article className="guest-structured-card" aria-live="polite">
              <header className="guest-structured-head">
                <span>Item name</span>
                <span>Quantity</span>
              </header>
              <ul className="guest-structured-list">
                {orderItems.map((it, idx) => {
                  const quantity = asNumber(it.quantity) ?? 1;
                  return (
                    <li className="guest-structured-row" key={`${it.name ?? "item"}-${idx}`}>
                      <span className="guest-structured-name">{it.name ?? "Item"}</span>
                      <span className="guest-structured-qty">{quantity}</span>
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
          ) : (
            <MenuSuggestionCards
              items={suggestions}
              loading={recommendationsLoading}
              emptyMessage={emptySuggestionMessage}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
