import type React from "react";
import "./VoiceOrb.css";

type Props = {
  /** "idle" | "listening" — reserved for when you wire real-time voice state */
  state?: "idle" | "listening";
  /** Smaller orb for customer page (default is compact in CSS for guest). */
  size?: "default" | "compact";
  /** Kitchen-style black / white / grey sphere (no purple). */
  tone?: "brand" | "mono";
  /** 4 frequency-band energy values [0-1] (bass → treble). When provided, rings react to pitch. */
  audioBands?: [number, number, number, number];
};

export function VoiceOrb({ state = "idle", size = "default", tone = "brand", audioBands }: Props) {
  const hasAudio = audioBands != null && audioBands.some((v) => v > 0);
  const cssVars = hasAudio
    ? ({
        "--w1": audioBands![0],
        "--w2": audioBands![1],
        "--w3": audioBands![2],
        "--w4": audioBands![3],
        // Weighted average favouring bass+low-mid (most energy in speech)
        "--wglow": Math.min(1, audioBands![0] * 0.45 + audioBands![1] * 0.35 + audioBands![2] * 0.15 + audioBands![3] * 0.05),
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`voice-orb-wrap ${size === "compact" ? "voice-orb-wrap--compact" : ""} ${tone === "mono" ? "voice-orb-wrap--mono" : ""} ${state === "listening" ? "is-listening" : ""} ${hasAudio ? "is-audio-driven" : ""}`}
      style={cssVars}
      aria-hidden
    >
      <div className="voice-orb-wave voice-orb-wave--1" />
      <div className="voice-orb-wave voice-orb-wave--2" />
      <div className="voice-orb-wave voice-orb-wave--3" />
      <div className="voice-orb-wave voice-orb-wave--4" />
      <div className="voice-orb-glow" />
      <div className="voice-orb-glow-accent" />
      <div className="voice-orb" />
      <div className="voice-orb-highlight" />
    </div>
  );
}
