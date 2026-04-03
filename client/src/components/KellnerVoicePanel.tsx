import { useCallback, useEffect, useRef, useState } from "react";
import { getKellnerWebSocketUrl } from "../lib/kellnerWs";
import type { MenuSuggestion } from "../types";
import "./KellnerVoicePanel.css";

const BARGE_RMS = 0.08;

type ConvLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
};

type RecItem = { name?: string; price?: number | string | null; info?: string };

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function downsampleTo16k(samples: Float32Array, fromRate: number) {
  if (fromRate === 16000) return samples;
  const ratio = fromRate / 16000;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    out[i] = samples[Math.floor(i * ratio)]!;
  }
  return out;
}

function floatTo16BitPCM(float32Array: Float32Array) {
  const buf = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]!));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

type Props = {
  onRecommendations?: (items: MenuSuggestion[]) => void;
  /** Fires when mic streaming is on/off (for orb UI). */
  onVoiceActiveChange?: (active: boolean) => void;
  /** Short line for under-orb label (Listening, Thinking, …). */
  onPhaseLabelChange?: (label: string) => void;
  /** default = full panel; guest = tighter layout, no duplicate status line */
  variant?: "default" | "guest";
  onConnectionChange?: (connected: boolean) => void;
};

function phaseLabelFromStatus(status: string): string {
  const s = status.toLowerCase();
  if (status === "Connecting…") return "Connecting…";
  if (s.includes("websocket") || s.includes("error —")) return "Connection issue";
  if (s.includes("disconnected")) return "Disconnected";
  if (s.includes("microphone access denied")) return "Mic blocked";
  if (s.includes("playback error")) return "Playback issue";
  if (s.startsWith("heard:") || s.includes("speak naturally")) return "Listening…";
  if (s.includes("thinking")) return "Thinking…";
  if (s.includes("speaking")) return "Speaking…";
  if (s.includes("tap") && s.includes("start")) return "Ready";
  if (s.includes("listening")) return "Listening…";
  return status.length > 32 ? `${status.slice(0, 29)}…` : status;
}

export function KellnerVoicePanel({
  onRecommendations,
  onVoiceActiveChange,
  onPhaseLabelChange,
  onConnectionChange,
  variant = "default",
}: Props) {
  const [connected, setConnected] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const micMutedRef = useRef(false);
  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);
  const [status, setStatus] = useState("Connecting…");
  const [lines, setLines] = useState<ConvLine[]>([]);
  const [startDisabled, setStartDisabled] = useState(true);

  const onRecRef = useRef(onRecommendations);
  useEffect(() => {
    onRecRef.current = onRecommendations;
  }, [onRecommendations]);

  const onVoiceRef = useRef(onVoiceActiveChange);
  useEffect(() => {
    onVoiceRef.current = onVoiceActiveChange;
  }, [onVoiceActiveChange]);

  const onPhaseRef = useRef(onPhaseLabelChange);
  useEffect(() => {
    onPhaseRef.current = onPhaseLabelChange;
  }, [onPhaseLabelChange]);

  useEffect(() => {
    onPhaseRef.current?.(phaseLabelFromStatus(status));
  }, [status]);

  useEffect(() => {
    onConnectionChange?.(connected);
  }, [connected, onConnectionChange]);

  const [livePartial, setLivePartial] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderNodeRef = useRef<ScriptProcessorNode | null>(null);
  const voiceActiveRef = useRef(false);
  const playbackTurnIdRef = useRef<number | null>(null);
  const assistantLineIdRef = useRef<string | null>(null);
  const assistantSpeakingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const bargeInAllowedAfterRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const stopAllPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    });
    activeSourcesRef.current = [];
    const ctx = audioCtxRef.current;
    if (ctx) nextPlayTimeRef.current = ctx.currentTime;
  }, []);

  const sendInterrupt = useCallback(() => {
    stopAllPlayback();
    assistantSpeakingRef.current = false;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "interrupt" }));
    }
  }, [stopAllPlayback]);

  const playPcmB64 = useCallback(
    async (b64: string, turnId: number) => {
      if (Number(turnId) !== Number(playbackTurnIdRef.current)) return;
      if (!b64?.length) return;
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new AudioContext();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const nSamp = Math.floor(u8.length / 2);
      if (nSamp < 1) return;
      const dv = new DataView(u8.buffer, u8.byteOffset, nSamp * 2);
      const f32 = new Float32Array(nSamp);
      for (let i = 0; i < nSamp; i++) f32[i] = dv.getInt16(i * 2, true) / 32768;

      const buffer = ctx.createBuffer(1, f32.length, 16000);
      buffer.copyToChannel(f32, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const now = ctx.currentTime;
      if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
      activeSourcesRef.current.push(src);
      src.onended = () => {
        const arr = activeSourcesRef.current;
        const i = arr.indexOf(src);
        if (i >= 0) arr.splice(i, 1);
      };
      src.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += buffer.duration;
    },
    []
  );

  const playbackMatchesTurn = (msg: { turn_id?: unknown }, allowBootstrap: boolean) => {
    const t = Number(msg.turn_id);
    if (Number.isNaN(t)) return false;
    if (playbackTurnIdRef.current === null && allowBootstrap) {
      playbackTurnIdRef.current = t;
      return true;
    }
    return Number(playbackTurnIdRef.current) === t;
  };

  function mapRecItems(items: RecItem[]): MenuSuggestion[] {
    return items.map((it) => ({
      dish_id: null,
      name: it.name ?? "Item",
      price:
        typeof it.price === "number"
          ? it.price
          : it.price != null && it.price !== ""
            ? Number(it.price)
            : null,
      currency: "USD",
      info: it.info ?? "",
    }));
  }

  function stopVoiceCapture() {
    voiceActiveRef.current = false;
    setVoiceActive(false);
    try {
      recorderNodeRef.current?.disconnect();
      recorderStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    recorderNodeRef.current = null;
    recorderStreamRef.current = null;
  }

  useEffect(() => {
    voiceActiveRef.current = voiceActive;
    const micLive = voiceActive && !micMuted;
    onVoiceRef.current?.(micLive);
  }, [voiceActive, micMuted]);

  useEffect(() => {
    /** Created inside deferred connect; avoids Strict Mode closing a CONNECTING socket (console noise). */
    let ws: WebSocket | null = null;
    const connectTimer = window.setTimeout(() => {
      const url = getKellnerWebSocketUrl();
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setStartDisabled(false);
        setStatus("Ready — tap Start voice chat.");
      };

      ws.onclose = () => {
        setConnected(false);
        setStartDisabled(true);
        stopVoiceCapture();
        setStatus("Disconnected.");
      };

      ws.onerror = () => {
        setStatus("WebSocket error — run uvicorn on :8000 and keep Vite proxy for /api/ws.");
      };

      ws.onmessage = async (ev) => {
      if (typeof ev.data !== "string") return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg.type as string;

      try {
        if (type === "transcript_partial") {
          const t = String(msg.text ?? "");
          setLivePartial(t);
          setStatus(`Heard: ${t || "…"}`);
        } else if (type === "transcript") {
          setLivePartial("");
          playbackTurnIdRef.current = Number(msg.turn_id);
          onRecRef.current?.([]);
          const ut = String(msg.text ?? "");
          setLines((prev) => [
            ...prev,
            { id: nextId(), role: "user", text: ut },
          ]);
          const aid = nextId();
          assistantLineIdRef.current = aid;
          setLines((prev) => [...prev, { id: aid, role: "assistant", text: "…", streaming: true }]);
          setStatus("Thinking…");
          assistantSpeakingRef.current = false;
        } else if (type === "recommendations") {
          if (Number(msg.turn_id) !== Number(playbackTurnIdRef.current)) return;
          const items = (msg.items as RecItem[]) ?? [];
          onRecRef.current?.(mapRecItems(items));
        } else if (type === "assistant_text_delta") {
          if (!playbackMatchesTurn(msg, false)) return;
          const delta = String(msg.text ?? "");
          const lineId = assistantLineIdRef.current;
          if (!lineId) return;
          setLines((prev) =>
            prev.map((l) => {
              if (l.id !== lineId) return l;
              const cur = l.text === "…" ? "" : `${l.text} `;
              return { ...l, text: cur + delta, streaming: true };
            })
          );
          setStatus("Speaking…");
        } else if (type === "audio_delta") {
          if (!playbackMatchesTurn(msg, true)) return;
          assistantSpeakingRef.current = true;
          bargeInAllowedAfterRef.current = performance.now() + 1400;
          await playPcmB64(String(msg.b64 ?? ""), Number(msg.turn_id));
        } else if (type === "done") {
          setLivePartial("");
          assistantSpeakingRef.current = false;
          const lineId = assistantLineIdRef.current;
          if (lineId) {
            setLines((prev) =>
              prev.map((l) => (l.id === lineId ? { ...l, streaming: false } : l))
            );
          }
          assistantLineIdRef.current = null;
          if (!activeSourcesRef.current.length) setStatus("Listening…");
        } else if (type === "interrupted") {
          setLivePartial("");
          stopAllPlayback();
          assistantSpeakingRef.current = false;
          assistantLineIdRef.current = null;
          setStatus("Listening…");
        } else if (type === "error") {
          const lineId = assistantLineIdRef.current;
          if (lineId) {
            setLines((prev) => prev.filter((l) => l.id !== lineId));
            assistantLineIdRef.current = null;
          }
          setStatus(String(msg.message ?? "Error"));
        }
      } catch (e) {
        console.error("ws message handler", e);
        setStatus("Playback error — check console");
      }
    };
    }, 0);

    return () => {
      clearTimeout(connectTimer);
      stopVoiceCapture();
      if (ws) {
        ws.close();
      }
      wsRef.current = null;
    };
    // Kellner FastAPI: single socket; onRecRef holds latest recommendations callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  async function startVoiceChat() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || voiceActiveRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      recorderStreamRef.current = stream;

      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new AudioContext();
        audioCtxRef.current = ctx;
      }
      await ctx.resume();

      ws.send(JSON.stringify({ type: "voice_session" }));

      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      recorderNodeRef.current = node;
      const fromRate = ctx.sampleRate;

      node.onaudioprocess = (e) => {
        if (micMutedRef.current) return;
        if (!voiceActiveRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const f32 = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < f32.length; i++) sum += f32[i]! * f32[i]!;
        const rms = Math.sqrt(sum / f32.length);
        if (
          assistantSpeakingRef.current &&
          performance.now() >= bargeInAllowedAfterRef.current &&
          rms > BARGE_RMS
        ) {
          sendInterrupt();
        }

        const down = downsampleTo16k(f32, fromRate);
        const pcm = floatTo16BitPCM(down);
        wsRef.current.send(pcm.buffer);
      };

      source.connect(node);
      const silentOut = ctx.createGain();
      silentOut.gain.value = 0;
      node.connect(silentOut);
      silentOut.connect(ctx.destination);

      voiceActiveRef.current = true;
      setMicMuted(false);
      setVoiceActive(true);
      setStartDisabled(true);
      setStatus("Listening… speak naturally");
    } catch {
      setStatus("Microphone access denied");
    }
  }

  const guest = variant === "guest";

  return (
    <section
      className={`kellner-voice-panel ${guest ? "kellner-voice-panel--guest" : ""}`}
      aria-label="Kellner voice"
    >
      {!guest && (
        <div className="kellner-voice-head">
          <h2 className="kellner-voice-title">Conversation</h2>
          <span
            className={`kellner-voice-dot ${connected ? "on" : ""}`}
            title={connected ? "Connected to Kellner" : "Disconnected"}
            aria-hidden
          />
        </div>
      )}
      {guest && <h2 className="sr-only">Voice session</h2>}
      {!guest && <p className="kellner-voice-status">{status}</p>}
      {!guest && (
        <div className="kellner-live-transcript" aria-live="polite">
          {livePartial ? (
            <>
              <span className="kellner-live-label">Live</span>
              <span className="kellner-live-text">{livePartial}</span>
            </>
          ) : (
            <span className="kellner-live-placeholder">What you say appears here as you speak…</span>
          )}
        </div>
      )}
      {!guest && (
        <div className="kellner-voice-conv" ref={listRef}>
          {lines.map((l) => (
            <div
              key={l.id}
              className={`kellner-voice-bubble ${l.role}${l.streaming ? " streaming" : ""}`}
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
      <div className={`kellner-voice-actions ${guest ? "kellner-voice-actions--guest" : ""}`}>
        <button
          type="button"
          className="kellner-voice-start"
          disabled={startDisabled || !connected}
          onClick={startVoiceChat}
        >
          {guest ? "Start session" : "Start voice chat"}
        </button>
        <button
          type="button"
          className={`kellner-voice-mic ${micMuted ? "is-muted" : ""}`}
          disabled={!voiceActive}
          aria-pressed={micMuted}
          title={!voiceActive ? "Start session first" : micMuted ? "Unmute microphone" : "Mute microphone"}
          onClick={() => setMicMuted((m) => !m)}
        >
          <svg
            className="kellner-voice-mic-svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" x2="12" y1="19" y2="22" />
            {micMuted ? <line x1="2" y1="2" x2="22" y2="22" /> : null}
          </svg>
          {micMuted ? "Mic off" : "Mic on"}
        </button>
      </div>
    </section>
  );
}
