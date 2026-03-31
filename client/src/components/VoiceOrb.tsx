import "./VoiceOrb.css";

type Props = {
  /** "idle" | "listening" — reserved for when you wire real-time voice state */
  state?: "idle" | "listening";
  /** Smaller orb for customer page (default is compact in CSS for guest). */
  size?: "default" | "compact";
  /** Kitchen-style black / white / grey sphere (no purple). */
  tone?: "brand" | "mono";
};

export function VoiceOrb({ state = "idle", size = "default", tone = "brand" }: Props) {
  return (
    <div
      className={`voice-orb-wrap ${size === "compact" ? "voice-orb-wrap--compact" : ""} ${tone === "mono" ? "voice-orb-wrap--mono" : ""} ${state === "listening" ? "is-listening" : ""}`}
      aria-hidden
    >
      <div className="voice-orb-glow" />
      <div className="voice-orb" />
      <div className="voice-orb-highlight" />
    </div>
  );
}
