import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { MenuSuggestion } from "../types";
import { VoiceOrb } from "../components/VoiceOrb";
import { MenuSuggestionCards } from "../components/MenuSuggestionCards";
import { KellnerVoicePanel } from "../components/KellnerVoicePanel";
import "./GuestVoicePage.css";

export default function GuestVoicePage() {
  const [search] = useSearchParams();
  const hotelQ = search.get("hotel_id");
  const guestHome = hotelQ ? `/guest?hotel_id=${encodeURIComponent(hotelQ)}` : "/guest";
  const [suggestions, setSuggestions] = useState<MenuSuggestion[]>([]);
  const [hasAskedForSuggestions, setHasAskedForSuggestions] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [micLive, setMicLive] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Connecting…");
  const [apiConnected, setApiConnected] = useState(false);
  const [audioBands, setAudioBands] = useState<[number, number, number, number]>([0, 0, 0, 0]);

  const emptySuggestionMessage = hasAskedForSuggestions
    ? "Sorry, we could not find matching suggestions right now."
    : "Hi there! What would you like to have today?";

  return (
    <div className="guest-page">
      <header className="guest-header">
        <div className="guest-brand">
          <img
            className="guest-brand-logo"
            src="/kellnerlogo.jpg"
            alt="Kellner"
          />
          <span className="guest-brand-tag">Guest</span>
        </div>
        <div className="guest-header-right">
          <span
            className={`guest-conn-dot ${apiConnected ? "is-on" : ""}`}
            title={apiConnected ? "Assistant connected" : "Connecting…"}
            aria-label={apiConnected ? "Assistant connected" : "Not connected"}
          />
          <Link className="guest-link-kitchen" to={guestHome}>
            Back
          </Link>
          <Link className="guest-link-kitchen" to="/kitchen">
            Kitchen staff
          </Link>
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
            onRecommendations={(items) => {
              setSuggestions(items);
            }}
            onRecommendationsLoadingChange={(loading) => {
              if (loading) setHasAskedForSuggestions(true);
              setRecommendationsLoading(loading);
            }}
            onVoiceActiveChange={setMicLive}
            onPhaseLabelChange={setPhaseLabel}
            onConnectionChange={setApiConnected}
            onAudioBands={setAudioBands}
          />
        </section>

        <aside className="guest-suggestions" aria-label="Suggestions from your assistant">
          <h2 className="guest-suggestions-title">Suggestions</h2>
          <MenuSuggestionCards
            items={suggestions}
            loading={recommendationsLoading}
            emptyMessage={emptySuggestionMessage}
          />
        </aside>
      </main>
    </div>
  );
}
