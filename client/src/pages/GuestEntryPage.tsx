import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getAuthSession } from "../lib/authSession";
import { apiUrl } from "../lib/api";
import { clearGuestCustomerId, setGuestCustomerId } from "../lib/guestCustomer";
import "./GuestEntryPage.css";

const COUNTDOWN_SECONDS = 3;
/** How long to show “0” before capturing (ms). */
const COUNTDOWN_ZERO_MS = 600;

type FaceRecogniseOk = {
  ok: true;
  customer_id: number;
  matched: boolean;
  created_new: boolean;
  distance: number;
};

function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 15000): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      video.removeEventListener("loadedmetadata", onMeta);
      reject(new Error("Camera took too long to start."));
    }, timeoutMs);
    const onMeta = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        window.clearTimeout(t);
        video.removeEventListener("loadedmetadata", onMeta);
        resolve();
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
    if (video.readyState >= 1) onMeta();
  });
}

export default function GuestEntryPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceCaptureCancelledRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const session = getAuthSession();
  const hotelId = search.get("hotel_id");

  useEffect(() => {
    if (!session?.session_id || session.role !== "device") {
      navigate("/", { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    clearGuestCustomerId();
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const cancelCamera = useCallback(() => {
    faceCaptureCancelledRef.current = true;
    stopStream();
    setCameraOpen(false);
    setCountdown(null);
  }, [stopStream]);

  const postFaceImage = useCallback(
    async (file: File) => {
      if (!session?.session_id) throw new Error("No session.");
      const fd = new FormData();
      fd.append("image", file, file.name || "capture.jpg");
      let r: Response;
      try {
        r = await fetch(apiUrl("/api/face/local/recognise"), {
          method: "POST",
          headers: {
            "x-device-session": session.session_id,
          },
          body: fd,
        });
      } catch (err) {
        if (err instanceof TypeError) {
          throw new Error(
            "Could not reach the face service — the connection was closed or the server is down. Check that the API is running."
          );
        }
        throw err;
      }
      const j = (await r.json().catch(() => ({}))) as FaceRecogniseOk & {
        detail?: string | string[];
      };
      if (!r.ok) {
        let msg = "Could not recognise face.";
        const d = j.detail;
        if (typeof d === "string") msg = d;
        else if (Array.isArray(d) && d[0] && typeof d[0] === "object" && d[0] !== null && "msg" in d[0]) {
          msg = String((d[0] as { msg: string }).msg);
        }
        if (r.status === 401) msg = "Session expired — log in again.";
        throw new Error(msg);
      }
      if (!j?.ok || typeof j.customer_id !== "number") {
        throw new Error("Unexpected response from face service.");
      }
      setGuestCustomerId(j.customer_id);
      const q = hotelId ? `?hotel_id=${encodeURIComponent(hotelId)}` : "";
      navigate(`/guest/voice${q}`);
    },
    [session, navigate, hotelId]
  );

  const startFaceId = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser.");
      return;
    }
    if (!session?.session_id) return;

    faceCaptureCancelledRef.current = false;
    setBusy(true);
    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;

      flushSync(() => setCameraOpen(true));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        throw new Error("Camera setup failed.");
      }

      video.srcObject = stream;
      await video.play().catch(() => {});
      await waitForVideoReady(video);
      if (faceCaptureCancelledRef.current) return;

      for (let s = COUNTDOWN_SECONDS; s >= 1; s--) {
        if (faceCaptureCancelledRef.current) return;
        flushSync(() => setCountdown(s));
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (faceCaptureCancelledRef.current) return;
      flushSync(() => setCountdown(0));
      await new Promise((r) => setTimeout(r, COUNTDOWN_ZERO_MS));
      if (faceCaptureCancelledRef.current) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        throw new Error("Could not read camera frame.");
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not capture image.");
      }
      ctx.drawImage(video, 0, 0, w, h);

      const file = await new Promise<File>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not encode image."));
              return;
            }
            resolve(new File([blob], "capture.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.92
        );
      });

      await postFaceImage(file);
    } catch (e) {
      if (faceCaptureCancelledRef.current) {
        setError(null);
      } else {
        const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Camera permission denied.");
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Something went wrong.");
        }
      }
    } finally {
      setBusy(false);
      setCountdown(null);
      setCameraOpen(false);
      stopStream();
    }
  }, [session, postFaceImage, stopStream]);

  const continueWithoutSignIn = useCallback(() => {
    clearGuestCustomerId();
    const q = hotelId ? `?hotel_id=${encodeURIComponent(hotelId)}` : "";
    navigate(`/guest/voice${q}`);
  }, [navigate, hotelId]);

  if (!session || session.role !== "device") {
    return null;
  }

  return (
    <div className="guest-entry">
      <header className="guest-entry-header">
        <div className="guest-entry-brand">
          <img className="guest-entry-logo" src="/kellnerlogo.jpg" alt="Kellner" />
          <span className="guest-entry-tag">Guest</span>
        </div>
        <Link className="guest-entry-link-kitchen" to="/kitchen">
          Kitchen staff
        </Link>
      </header>

      <main className="guest-entry-main">
        <h1 className="guest-entry-title">Welcome</h1>
        <p className="guest-entry-sub">
          Choose how you’d like to start your session at the table.
        </p>

        <div className="guest-entry-actions">
          <button
            type="button"
            className="guest-entry-btn guest-entry-btn-primary"
            disabled={busy}
            onClick={() => void startFaceId()}
          >
            {busy ? "Capturing…" : "Start with Face ID"}
          </button>

          <button
            type="button"
            className="guest-entry-btn guest-entry-btn-secondary"
            disabled={busy}
            onClick={continueWithoutSignIn}
          >
            Continue without sign in
          </button>
        </div>

        {error ? (
          <p className="guest-entry-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>

      {cameraOpen ? (
        <div className="guest-entry-camera-overlay" role="dialog" aria-modal="true" aria-label="Face capture">
          <div className="guest-entry-camera-panel">
            <p className="guest-entry-camera-hint">Position your face in the frame</p>
            <div className="guest-entry-camera-video-wrap">
              <video ref={videoRef} className="guest-entry-camera-video" playsInline muted autoPlay />
              {countdown !== null && countdown >= 0 ? (
                <div className="guest-entry-countdown" aria-live="polite">
                  {countdown}
                </div>
              ) : null}
            </div>
            <canvas ref={canvasRef} className="guest-entry-camera-hidden" aria-hidden />
            <button
              type="button"
              className="guest-entry-btn guest-entry-btn-secondary guest-entry-cancel"
              onClick={cancelCamera}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
