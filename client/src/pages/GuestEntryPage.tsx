import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getAuthSession } from "../lib/authSession";
import { apiUrl } from "../lib/api";
import { clearGuestCustomerId, setGuestCustomerId } from "../lib/guestCustomer";
import "./GuestEntryPage.css";

type FaceRecogniseOk = {
  ok: true;
  customer_id: number;
  matched: boolean;
  created_new: boolean;
  distance: number;
};

export default function GuestEntryPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

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

  /** Stop camera when leaving the page or closing modal */
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return;
    const v = videoRef.current;
    v.srcObject = streamRef.current;
    void v.play().catch(() => {});
  }, [cameraOpen]);

  const openCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser.");
      return;
    }
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
      setCameraOpen(true);
    } catch {
      setError("Could not open camera. Check permissions, or use “Upload a photo” below.");
    }
  }, []);

  const continueWithoutSignIn = useCallback(() => {
    clearGuestCustomerId();
    const q = hotelId ? `?hotel_id=${encodeURIComponent(hotelId)}` : "";
    navigate(`/guest/voice${q}`);
  }, [navigate, hotelId]);

  const submitFaceImage = useCallback(
    async (file: File) => {
      if (!session?.session_id) return;
      setError(null);
      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("image", file, file.name || "capture.jpg");
        const r = await fetch(apiUrl("/api/face/local/recognise"), {
          method: "POST",
          headers: {
            "x-device-session": session.session_id,
          },
          body: fd,
        });
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
        closeCamera();
        const q = hotelId ? `?hotel_id=${encodeURIComponent(hotelId)}` : "";
        navigate(`/guest/voice${q}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [session, navigate, hotelId, closeCamera]
  );

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
        void submitFaceImage(file);
      },
      "image/jpeg",
      0.92
    );
  }, [submitFaceImage]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void submitFaceImage(f);
  };

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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="guest-entry-file-input"
            aria-hidden
            tabIndex={-1}
            onChange={onFileChange}
          />
          <button
            type="button"
            className="guest-entry-btn guest-entry-btn-primary"
            disabled={busy}
            onClick={() => void openCamera()}
          >
            {busy ? "Working…" : "Start with Face ID"}
          </button>

          <button
            type="button"
            className="guest-entry-btn guest-entry-btn-ghost"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload a photo instead
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
            <video ref={videoRef} className="guest-entry-camera-video" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="guest-entry-camera-canvas" aria-hidden />
            <div className="guest-entry-camera-actions">
              <button type="button" className="guest-entry-btn guest-entry-btn-secondary" disabled={busy} onClick={closeCamera}>
                Cancel
              </button>
              <button type="button" className="guest-entry-btn guest-entry-btn-primary" disabled={busy} onClick={captureFromCamera}>
                {busy ? "…" : "Capture"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
