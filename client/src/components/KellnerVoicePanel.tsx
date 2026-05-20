import { useCallback, useEffect, useRef, useState } from "react";
import { getKellnerWebSocketUrl } from "../lib/kellnerWs";
import { parseOrderSuggestionsPayload } from "../lib/orderSuggestions";
import type { MenuSuggestion, OrderSuggestionsEvent } from "../types";
import "./KellnerVoicePanel.css";

const BARGE_RMS = 0.08;

type ConvLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
};

type RecItem = {
  name?: string;
  price?: number | string | null;
  info?: string;
  image?: string | null;
};
type ReplyMode = "none" | "bill" | "order_confirmation" | "recommendations";
type StructuredPayload = {
  recommendation_focus?: string;
  items?: Array<RecItem & { quantity?: number | string | null }>;
  total?: number | string | null;
};

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Stop tablet long-press menus (share / print / text selection) on hold-to-speak. */
function blockBrowserGesture(e: Event) {
  e.preventDefault();
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
  onRecommendationsLoadingChange?: (loading: boolean) => void;
  /** Fires when mic streaming is on/off (for orb UI). */
  onVoiceActiveChange?: (active: boolean) => void;
  /** Short line for under-orb label (Listening, Thinking, …). */
  onPhaseLabelChange?: (label: string) => void;
  /** Fires on each animation frame with 4 frequency-band energy values [0-1] (bass → treble). */
  onAudioBands?: (bands: [number, number, number, number]) => void;
  /** default = full panel; guest = tighter layout, no duplicate status line */
  variant?: "default" | "guest";
  onConnectionChange?: (connected: boolean) => void;
  onReplyModeChange?: (mode: ReplyMode) => void;
  onStructuredPayload?: (mode: ReplyMode, payload: unknown) => void;
  /** Silent pairing rail after voice `place_order` (`order_suggestions`). */
  onOrderSuggestions?: (event: OrderSuggestionsEvent) => void;
  /** Start of a new user utterance — clear stale pairing UI from the previous turn. */
  onUserTranscript?: () => void;
  /**
   * Guest: when true (e.g. navigated from “Call waiter”), connect then start mic automatically
   * and send `{ type: "guest_greeting" }` after `voice_session` so the backend can open with a welcome line.
   */
  autoStartVoiceSession?: boolean;
};

function phaseLabelFromStatus(status: string): string {
  const s = status.toLowerCase();
  if (status === "Connecting…") return "Connecting…";
  if (s.includes("starting")) return "Starting…";
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
  onRecommendationsLoadingChange,
  onVoiceActiveChange,
  onPhaseLabelChange,
  onAudioBands,
  onConnectionChange,
  onReplyModeChange,
  onStructuredPayload,
  onOrderSuggestions,
  onUserTranscript,
  variant = "default",
  autoStartVoiceSession = false,
}: Props) {
  const [connected, setConnected] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  /**
   * Hold-to-speak: mic is muted by default; only unmutes while the user
   * presses the mic button. The existing capture/RMS/uplink path inside
   * `node.onaudioprocess` already gates entirely on `micMutedRef.current`,
   * so no other code paths need to change.
   */
  const [micMuted, setMicMuted] = useState(true);
  const micMutedRef = useRef(true);
  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);
  /**
   * Tracks whether we've already announced `speech_start` for the current hold
   * so `releaseMic` only emits `speech_end` once even when pointerUp +
   * lostPointerCapture (or pointerCancel) fire in quick succession.
   */
  const micHeldRef = useRef(false);
  const micBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = micBtnRef.current;
    if (!el) return;
    el.addEventListener("contextmenu", blockBrowserGesture);
    el.addEventListener("selectstart", blockBrowserGesture);
    el.addEventListener("dragstart", blockBrowserGesture);
    el.addEventListener("touchstart", blockBrowserGesture, { passive: false });
    el.addEventListener("touchmove", blockBrowserGesture, { passive: false });
    return () => {
      el.removeEventListener("contextmenu", blockBrowserGesture);
      el.removeEventListener("selectstart", blockBrowserGesture);
      el.removeEventListener("dragstart", blockBrowserGesture);
      el.removeEventListener("touchstart", blockBrowserGesture);
      el.removeEventListener("touchmove", blockBrowserGesture);
    };
  }, []);
  /**
   * After release, keep streaming a tiny burst of synthetic ~-60 dB dither for
   * this many ms so the server VAD's silence timer can tick and commit the
   * last partial. Without it, releasing produces no transcript until the
   * *next* hold's audio re-triggers the VAD (the classic "stuck partial"
   * bug). 1200 ms comfortably covers the 500–1000 ms endpoint thresholds
   * used by all common streaming STTs.
   */
  const TAIL_DITHER_MS = 1200;
  const tailDitherUntilRef = useRef(0);
  const [status, setStatus] = useState("Connecting…");
  const [lines, setLines] = useState<ConvLine[]>([]);
  const [startDisabled, setStartDisabled] = useState(true);
  /** Guest autostart: hide Start until mic denied — then show for retry. */
  const [guestAutostartFailed, setGuestAutostartFailed] = useState(false);

  const onRecRef = useRef(onRecommendations);
  useEffect(() => {
    onRecRef.current = onRecommendations;
  }, [onRecommendations]);

  const onRecLoadingRef = useRef(onRecommendationsLoadingChange);
  useEffect(() => {
    onRecLoadingRef.current = onRecommendationsLoadingChange;
  }, [onRecommendationsLoadingChange]);

  const onVoiceRef = useRef(onVoiceActiveChange);
  useEffect(() => {
    onVoiceRef.current = onVoiceActiveChange;
  }, [onVoiceActiveChange]);

  const onPhaseRef = useRef(onPhaseLabelChange);
  useEffect(() => {
    onPhaseRef.current = onPhaseLabelChange;
  }, [onPhaseLabelChange]);
  const onReplyModeRef = useRef(onReplyModeChange);
  useEffect(() => {
    onReplyModeRef.current = onReplyModeChange;
  }, [onReplyModeChange]);
  const onStructuredPayloadRef = useRef(onStructuredPayload);
  useEffect(() => {
    onStructuredPayloadRef.current = onStructuredPayload;
  }, [onStructuredPayload]);
  const onOrderSuggestionsRef = useRef(onOrderSuggestions);
  useEffect(() => {
    onOrderSuggestionsRef.current = onOrderSuggestions;
  }, [onOrderSuggestions]);
  const onUserTranscriptRef = useRef(onUserTranscript);
  useEffect(() => {
    onUserTranscriptRef.current = onUserTranscript;
  }, [onUserTranscript]);

  useEffect(() => {
    onPhaseRef.current?.(phaseLabelFromStatus(status));
  }, [status]);

  useEffect(() => {
    onConnectionChange?.(connected);
  }, [connected, onConnectionChange]);

  const [livePartial, setLivePartial] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  /** AudioContext for mic capture only — never closed during a session. */
  const audioCtxRef = useRef<AudioContext | null>(null);
  /** Separate AudioContext exclusively for assistant TTS. Destroyed on interrupt. */
  const ttsCtxRef = useRef<AudioContext | null>(null);
  /** GainNode on the TTS context — hard-muted to 0 on interrupt before ctx.close(). */
  const ttsGainRef = useRef<GainNode | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderNodeRef = useRef<ScriptProcessorNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const analyserBufRef = useRef<Uint8Array | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const onAudioBandsRef = useRef(onAudioBands);
  useEffect(() => { onAudioBandsRef.current = onAudioBands; }, [onAudioBands]);

  
  const voiceActiveRef = useRef(false);
  const playbackTurnIdRef = useRef<number | null>(null);
  const assistantLineIdRef = useRef<string | null>(null);
  const assistantSpeakingRef = useRef(false);
  const currentReplyModeRef = useRef<ReplyMode>("none");
  const replyModeByTurnRef = useRef<Map<number, ReplyMode>>(new Map());
  const nextPlayTimeRef = useRef(0);
  const bargeInAllowedAfterRef = useRef(0);
  /**
   * Latches when the user has already barged-in for the current utterance,
   * so we don't fire `sendInterrupt` repeatedly across many `transcript_partial`
   * events (or a partial + the legacy RMS path) for the same speech.
   * Reset whenever a new user utterance / assistant turn boundary is reached.
   */
  const bargedInForUtteranceRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // ── Layer 1: discard set — turn_ids whose audio must NEVER play ──
  const discardedTurnIdsRef = useRef<Set<number>>(new Set());

  // ── Layer 2: playback epoch — bumped on every local interrupt ──
  const playbackEpochRef = useRef(0);

  /**
   * FLUSH — the single function that kills all assistant audio.
   * Called on user barge-in AND on server `interrupted`.
   *
   * Layer 3: gain → 0 (instant mute even if close() is async)
   * Layer 4: stop every tracked source node
   * Layer 5: close the entire TTS AudioContext (nothing can ever play on a closed ctx)
   */
  const flushAssistantAudio = useCallback(() => {
    // Layer 3 — hard-mute the gain node so speakers go silent THIS sample frame
    const gain = ttsGainRef.current;
    if (gain) {
      try { gain.gain.setValueAtTime(0, 0); } catch { /* ok */ }
      try { gain.disconnect(); } catch { /* ok */ }
      ttsGainRef.current = null;
    }

    // Layer 4 — stop every tracked source
    // (redundant after close(), but close() might resolve async on some browsers)
    const ctx = ttsCtxRef.current;
    if (ctx) {
      try { ctx.suspend(); } catch { /* ok */ }
      try { ctx.close(); } catch { /* ok */ }
      ttsCtxRef.current = null;
    }

    // Layer 2 — bump epoch so any stale reference in-flight is invalid
    playbackEpochRef.current += 1;
    nextPlayTimeRef.current = 0;
  }, []);

  /**
   * Graceful end-of-turn shutdown for the TTS audio chain.
   *
   * Used ONLY on a clean server `done`. Solves the "radio noise / hiss tail" heard
   * after every assistant sentence by:
   *   1. Linear-ramping `ttsGain` to 0 ending exactly at the last scheduled sample,
   *      so the buffer terminates at zero (no DAC step → no click).
   *   2. Suspending the TTS `AudioContext` after the fade so the audio output
   *      hardware goes idle (kills the speaker noise floor between turns).
   *
   * NOT a replacement for `flushAssistantAudio`: barge-in (`interrupted`) still
   * needs the immediate hard-mute + close path. We keep refs alive here so the
   * next `audio_delta` can resume() the same context cheaply.
   */
  const softFinishAssistantAudio = useCallback(() => {
    const ctx = ttsCtxRef.current;
    const gain = ttsGainRef.current;
    if (!ctx || !gain || ctx.state === "closed") return;

    const FADE_S = 0.08;
    const SUSPEND_GUARD_MS = 120;

    const now = ctx.currentTime;
    const endTime = Math.max(nextPlayTimeRef.current, now);
    const fadeStart = Math.max(now, endTime - FADE_S);

    try {
      gain.gain.cancelScheduledValues(fadeStart);
      gain.gain.setValueAtTime(gain.gain.value, fadeStart);
      gain.gain.linearRampToValueAtTime(0, endTime);
    } catch {
      /* ok — fall through to suspend */
    }

    const fadeMs = Math.max(0, (endTime - now) * 1000);
    window.setTimeout(() => {
      const c = ttsCtxRef.current;
      if (!c || c.state !== "running") return;
      c.suspend().catch(() => {});
    }, fadeMs + SUSPEND_GUARD_MS);
  }, []);

  /**
   * Press: open mic locally + tell server a new speech segment is starting so
   * its STT can spin up a fresh recognition session. Idempotent — repeated
   * presses without a release are no-ops.
   */
  const acquireMic = useCallback(() => {
    if (micHeldRef.current) return;
    micHeldRef.current = true;
    micMutedRef.current = false;
    setMicMuted(false);
    // New hold cancels any pending tail dither — real audio takes over.
    tailDitherUntilRef.current = 0;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "speech_start" }));
      } catch {
        /* socket may have died between checks; recovery layer will reconnect */
      }
    }
  }, []);

  /**
   * Release: stop streaming + tell server the segment ended so it can flush
   * the last partial → commit the turn. Idempotent across pointerUp /
   * pointerCancel / lostPointerCapture so we never send a duplicate
   * `speech_end` for the same hold.
   */
  const releaseMic = useCallback(() => {
    if (!micHeldRef.current) return;
    micHeldRef.current = false;
    micMutedRef.current = true;
    setMicMuted(true);
    // Arm the tail-dither window so the server VAD finishes endpointing.
    tailDitherUntilRef.current = performance.now() + TAIL_DITHER_MS;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "speech_end" }));
      } catch {
        /* same as above — best-effort */
      }
    }
  }, []);

  /**
   * Full client-side interrupt: flush + discard turn + notify server.
   */
  const sendInterrupt = useCallback(() => {
    const tid = playbackTurnIdRef.current;
    if (tid !== null) discardedTurnIdsRef.current.add(tid);  // Layer 1
    playbackTurnIdRef.current = null;
    flushAssistantAudio();
    assistantSpeakingRef.current = false;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "interrupt" }));
    }
  }, [flushAssistantAudio]);

  /**
   * Get or lazily create a fresh TTS context + gain node.
   *
   * If the context was previously `suspended` by `softFinishAssistantAudio`
   * (clean turn end), we resume it, snap gain back to 1, and reset the
   * playback cursor so the new turn starts cleanly.
   */
  const getTtsCtx = (): { ctx: AudioContext; gain: GainNode } => {
    let ctx = ttsCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      ttsCtxRef.current = ctx;
      const g = ctx.createGain();
      g.gain.value = 1;
      g.connect(ctx.destination);
      ttsGainRef.current = g;
      nextPlayTimeRef.current = ctx.currentTime;
    } else if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
      const g = ttsGainRef.current;
      if (g) {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(1, ctx.currentTime);
        } catch {
          /* ok */
        }
      }
      nextPlayTimeRef.current = ctx.currentTime;
    }
    return { ctx, gain: ttsGainRef.current! };
  };

  /**
   * Decode one b64 PCM chunk and schedule it on the TTS context.
   * Fully synchronous — no await, no microtask yield, no race window.
   */
  const playPcmB64 = useCallback(
    (b64: string, turnId: number) => {
      // Layer 1: discarded turn
      if (discardedTurnIdsRef.current.has(turnId)) return;
      // Active turn gate
      if (playbackTurnIdRef.current === null || Number(turnId) !== Number(playbackTurnIdRef.current)) return;
      if (!b64?.length) return;

      // Layer 2: epoch snapshot
      const epochAtEntry = playbackEpochRef.current;

      const { ctx, gain } = getTtsCtx();
      if (ctx.state === "closed") return;
      if (playbackEpochRef.current !== epochAtEntry) return;

      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const nSamp = Math.floor(u8.length / 2);
      if (nSamp < 1) return;
      if (playbackEpochRef.current !== epochAtEntry) return;

      const dv = new DataView(u8.buffer, u8.byteOffset, nSamp * 2);
      const f32 = new Float32Array(nSamp);
      for (let i = 0; i < nSamp; i++) f32[i] = dv.getInt16(i * 2, true) / 32768;

      const buffer = ctx.createBuffer(1, f32.length, 16000);
      buffer.copyToChannel(f32, 0);
      if (playbackEpochRef.current !== epochAtEntry) return;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);  // → gain → ctx.destination

      const now = ctx.currentTime;
      if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
      src.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += buffer.duration;
    },
    []
  );

  /** Check all layers before accepting any assistant stream message for this turn. */
  const isTurnAlive = (tid: unknown): boolean => {
    const t = Number(tid);
    if (Number.isNaN(t)) return false;
    if (discardedTurnIdsRef.current.has(t)) return false;           // Layer 1
    if (playbackTurnIdRef.current === null) return false;
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
      image: it.image ?? null,
    }));
  }

  function applyStructuredPayload(turnId: number, payload: unknown) {
    const mode = replyModeByTurnRef.current.get(turnId) ?? currentReplyModeRef.current;
    onStructuredPayloadRef.current?.(mode, payload);
    if (!payload || typeof payload !== "object") return;
    const p = payload as StructuredPayload;
    if (!Array.isArray(p.items)) return;
    if (mode === "recommendations") {
      onRecRef.current?.(mapRecItems(p.items));
      onRecLoadingRef.current?.(false);
      return;
    }
    if (mode === "order_confirmation") {
      const asSuggestions: MenuSuggestion[] = p.items.map((it) => {
        const quantity =
          typeof it.quantity === "number" ? it.quantity : Number(it.quantity ?? 1);
        const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        const price =
          typeof it.price === "number"
            ? it.price
            : it.price != null && it.price !== ""
              ? Number(it.price)
              : null;
        return {
          dish_id: null,
          name: it.name ?? "Item",
          price: Number.isFinite(price as number) ? (price as number) : null,
          currency: "USD",
          info: `Quantity: ${safeQty}`,
        };
      });
      onRecRef.current?.(asSuggestions);
    }
    onRecLoadingRef.current?.(false);
  }

  function stopVoiceCapture() {
    voiceActiveRef.current = false;
    setVoiceActive(false);
    // Drop any in-flight hold without trying to notify the server: socket may
    // already be closed, and the next session will start a fresh hold anyway.
    micHeldRef.current = false;
    micMutedRef.current = true;
    setMicMuted(true);
    tailDitherUntilRef.current = 0;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    onAudioBandsRef.current?.([0, 0, 0, 0]);
    try {
      recorderNodeRef.current?.disconnect();
      analyserNodeRef.current?.disconnect();
      recorderStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    recorderNodeRef.current = null;
    analyserNodeRef.current = null;
    analyserBufRef.current = null;
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
      onRecLoadingRef.current?.(false);
      setStatus("Disconnected.");
    };

      ws.onerror = () => {
        setStatus("WebSocket error — run uvicorn on :8000 and keep Vite proxy for /api/ws.");
      };

      ws.onmessage = (ev) => {
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
          // Partial-driven barge-in: as soon as the server confirms the user
          // is speaking (first partial of this utterance) while assistant TTS
          // is still streaming, cut the assistant immediately.
          if (assistantSpeakingRef.current && !bargedInForUtteranceRef.current) {
            bargedInForUtteranceRef.current = true;
            sendInterrupt();
          }

        } else if (type === "transcript") {
          setLivePartial("");
          onUserTranscriptRef.current?.();
          // Kill any previous turn's audio before accepting the new turn
          flushAssistantAudio();
          // New logical turn — clear old discard entries (memory bound)
          discardedTurnIdsRef.current.clear();
          currentReplyModeRef.current = "none";
          replyModeByTurnRef.current.clear();
          onReplyModeRef.current?.("none");
          const tid = Number(msg.turn_id);
          playbackTurnIdRef.current = Number.isFinite(tid) ? tid : null;
          onRecLoadingRef.current?.(true);
          const ut = String(msg.text ?? "");
          setLines((prev) => [...prev, { id: nextId(), role: "user", text: ut }]);
          const aid = nextId();
          assistantLineIdRef.current = aid;
          setLines((prev) => [...prev, { id: aid, role: "assistant", text: "…", streaming: true }]);
          setStatus("Thinking…");
          assistantSpeakingRef.current = false;
          // Utterance complete — next user utterance gets a fresh barge-in chance.
          bargedInForUtteranceRef.current = false;

        } else if (type === "assistant_reply_mode") {
          const tid = Number(msg.turn_id);
          const mode = String(msg.mode ?? "none") as ReplyMode;
          if (!Number.isFinite(tid)) return;
          currentReplyModeRef.current = mode;
          replyModeByTurnRef.current.set(tid, mode);
          onReplyModeRef.current?.(mode);

        } else if (type === "assistant_structured") {
          const tid = Number(msg.turn_id);
          if (!Number.isFinite(tid)) return;
          if (!isTurnAlive(tid)) return;
          applyStructuredPayload(tid, msg.payload);

        } else if (type === "recommendations") {
          if (!isTurnAlive(msg.turn_id)) return;
          const items = (msg.items as RecItem[]) ?? [];
          onRecRef.current?.(mapRecItems(items));
          onRecLoadingRef.current?.(false);
        } else if (type === "order_suggestions") {
          const tid = Number(msg.turn_id);
          if (!Number.isFinite(tid)) return;
          if (!isTurnAlive(tid)) return;
          const payload = parseOrderSuggestionsPayload(msg.payload);
          if (!payload) return;
          const orderId =
            msg.order_id == null || msg.order_id === ""
              ? null
              : String(msg.order_id);
          onOrderSuggestionsRef.current?.({
            turn_id: tid,
            order_id: orderId,
            payload,
          });
        } else if (type === "assistant_text_delta") {
          if (!isTurnAlive(msg.turn_id)) return;
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
          // Layer 1: discard set
          const tid = Number(msg.turn_id);
          if (discardedTurnIdsRef.current.has(tid)) return;
          if (!isTurnAlive(msg.turn_id)) return;
          assistantSpeakingRef.current = true;
          bargeInAllowedAfterRef.current = performance.now() + 1400;
          playPcmB64(String(msg.b64 ?? ""), tid);

        } else if (type === "done") {
          setLivePartial("");
          const tid = Number(msg.turn_id);
          if (Number.isFinite(tid)) replyModeByTurnRef.current.delete(tid);
          assistantSpeakingRef.current = false;
          onRecLoadingRef.current?.(false);
          const lineId = assistantLineIdRef.current;
          if (lineId) {
            setLines((prev) =>
              prev.map((l) => (l.id === lineId ? { ...l, streaming: false } : l))
            );
          }
          assistantLineIdRef.current = null;
          softFinishAssistantAudio();
          // Assistant naturally finished — clear barge-in latch for the next turn.
          bargedInForUtteranceRef.current = false;
          setStatus("Listening…");

        } else if (type === "interrupted") {
          // Server confirmed interrupt — add turn_id to discard set + flush
          setLivePartial("");
          const tid = Number(msg.turn_id);
          if (Number.isFinite(tid)) {
            discardedTurnIdsRef.current.add(tid);
            replyModeByTurnRef.current.delete(tid);
          }
          playbackTurnIdRef.current = null;
          flushAssistantAudio();
          assistantSpeakingRef.current = false;
          assistantLineIdRef.current = null;
          onRecLoadingRef.current?.(false);
          // Server-confirmed interrupt — latch can be cleared for the next utterance.
          bargedInForUtteranceRef.current = false;
          setStatus("Listening…");

        } else if (type === "error") {
          const lineId = assistantLineIdRef.current;
          if (lineId) {
            setLines((prev) => prev.filter((l) => l.id !== lineId));
            assistantLineIdRef.current = null;
          }
          onRecLoadingRef.current?.(false);
          setStatus(String(msg.message ?? "Error"));
        }
      } catch (e) {
        console.error("ws message handler", e);
        onRecLoadingRef.current?.(false);
        setStatus("Playback error — check console");
      }
    };
    }, 0);

    return () => {
      clearTimeout(connectTimer);
      stopVoiceCapture();
      playbackTurnIdRef.current = null;
      flushAssistantAudio();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
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

  async function startVoiceChat(opts?: { sendGuestGreeting?: boolean }) {
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
      if (opts?.sendGuestGreeting) {
        ws.send(JSON.stringify({ type: "guest_greeting" }));
      }

      const source = ctx.createMediaStreamSource(stream);

      // ── Analyser for pitch-reactive wave rings ────────────────────────
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;              // 128 usable bins
      analyser.smoothingTimeConstant = 0.78;
      analyserNodeRef.current = analyser;
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      analyserBufRef.current = freqBuf;

      // Each bin ≈ sampleRate/fftSize Hz. For 44100 Hz that's ~172 Hz/bin.
      // Band 0 (inner ring / bass):   bins 0-3   ≈ 0–516 Hz
      // Band 1 (low-mid):             bins 4-9   ≈ 688–1548 Hz
      // Band 2 (mid):                 bins 10-22 ≈ 1720–3784 Hz
      // Band 3 (outer ring / treble): bins 23-50 ≈ 3956–8600 Hz
      const BANDS: [number, number][] = [[0, 3], [4, 9], [10, 22], [23, 50]];
      const bandAvg = (start: number, end: number): number => {
        let sum = 0;
        for (let i = start; i <= end; i++) sum += freqBuf[i]!;
        return sum / ((end - start + 1) * 255);
      };

      const rafLoop = () => {
        rafIdRef.current = requestAnimationFrame(rafLoop);
        analyser.getByteFrequencyData(freqBuf);
        onAudioBandsRef.current?.(
          BANDS.map(([s, e]) => bandAvg(s, e)) as [number, number, number, number]
        );
      };
      rafIdRef.current = requestAnimationFrame(rafLoop);
      // ─────────────────────────────────────────────────────────────────

      const node = ctx.createScriptProcessor(4096, 1, 1);
      recorderNodeRef.current = node;
      const fromRate = ctx.sampleRate;

      node.onaudioprocess = (e) => {
        if (!voiceActiveRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const f32 = e.inputBuffer.getChannelData(0);

        // Hold-to-speak gating with a short post-release dither tail.
        //
        // Press/release emit `speech_start` / `speech_end` JSON so backends
        // that respect them can endpoint immediately (see `acquireMic` /
        // `releaseMic`). For backends that only endpoint via VAD silence
        // timers, sending nothing on release leaves the last partial stuck
        // — the next hold's audio is what finally commits the previous turn.
        // To avoid that, for ~TAIL_DITHER_MS after release we keep streaming
        // synthetic ~-60 dB dither so the VAD silence clock ticks and commits
        // the turn. After the tail elapses, we go fully silent — no continuous
        // STT bill between utterances.
        if (micMutedRef.current) {
          if (performance.now() >= tailDitherUntilRef.current) return;
          const dither = new Float32Array(f32.length);
          for (let i = 0; i < dither.length; i++) {
            dither[i] = (Math.random() - 0.5) * 0.001;
          }
          const downS = downsampleTo16k(dither, fromRate);
          const pcmS = floatTo16BitPCM(downS);
          wsRef.current.send(pcmS.buffer);
          return;
        }

        let sum = 0;
        for (let i = 0; i < f32.length; i++) sum += f32[i]! * f32[i]!;
        const rms = Math.sqrt(sum / f32.length);
        if (
          assistantSpeakingRef.current &&
          !bargedInForUtteranceRef.current &&
          performance.now() >= bargeInAllowedAfterRef.current &&
          rms > BARGE_RMS
        ) {
          bargedInForUtteranceRef.current = true;
          sendInterrupt();
        }

        const down = downsampleTo16k(f32, fromRate);
        const pcm = floatTo16BitPCM(down);
        wsRef.current.send(pcm.buffer);
      };

      source.connect(analyser);
      analyser.connect(node);
      const silentOut = ctx.createGain();
      silentOut.gain.value = 0;
      node.connect(silentOut);
      silentOut.connect(ctx.destination);

      voiceActiveRef.current = true;
      // Hold-to-speak: stay muted on session start; unmutes only while pressed.
      micMutedRef.current = true;
      setMicMuted(true);
      setVoiceActive(true);
      setStartDisabled(true);
      setStatus("Listening… speak naturally");
      setGuestAutostartFailed(false);
    } catch {
      setStatus("Microphone access denied");
      if (opts?.sendGuestGreeting) setGuestAutostartFailed(true);
    }
  }

  const guestAutoStartDoneRef = useRef(false);
  useEffect(() => {
    if (variant !== "guest" || !autoStartVoiceSession || !connected || guestAutoStartDoneRef.current) return;
    guestAutoStartDoneRef.current = true;
    setStatus("Starting…");
    void startVoiceChat({ sendGuestGreeting: true });
    // startVoiceChat is stable enough for this one-shot; deps are the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, variant, autoStartVoiceSession]);

  const guest = variant === "guest";
  /** Hide “Start session” while guest autostart is in progress or succeeded; show again if mic was denied. */
  const showGuestStartButton = !guest || !autoStartVoiceSession || guestAutostartFailed;

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
        {showGuestStartButton ? (
        <button
          type="button"
          className="kellner-voice-start"
          disabled={startDisabled || !connected}
          onClick={() => void startVoiceChat()}
        >
          {guest ? "Start session" : "Start voice chat"}
        </button>
        ) : null}
        <button
          ref={micBtnRef}
          type="button"
          className={`kellner-voice-mic ${!micMuted ? "is-holding" : ""}`}
          disabled={!voiceActive}
          aria-pressed={!micMuted}
          aria-label={!voiceActive ? "Start session first" : "Hold to speak"}
          onContextMenu={blockBrowserGesture}
          onSelectStart={blockBrowserGesture}
          onDragStart={blockBrowserGesture}
          onPointerDown={(e) => {
            if (!voiceActive) return;
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ }
            acquireMic();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ok */ }
            releaseMic();
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            releaseMic();
          }}
          onLostPointerCapture={() => {
            releaseMic();
          }}
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
          </svg>
          <span className="kellner-voice-mic-label" aria-hidden>
            {!micMuted ? "Speaking…" : "Hold to speak"}
          </span>
        </button>
      </div>
    </section>
  );
}
