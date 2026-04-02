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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = getAuthSession();
  const hotelId = search.get("hotel_id");

  useEffect(() => {
    if (!session?.session_id || session.role !== "device") {
      navigate("/", { replace: true });
    }
  }, [session, navigate]);

  /** Fresh choice each time someone lands on the welcome screen. */
  useEffect(() => {
    clearGuestCustomerId();
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
        const q = hotelId ? `?hotel_id=${encodeURIComponent(hotelId)}` : "";
        navigate(`/guest/voice${q}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [session, navigate, hotelId]
  );

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
            capture="environment"
            className="guest-entry-file-input"
            aria-hidden
            tabIndex={-1}
            onChange={onFileChange}
          />
          <button
            type="button"
            className="guest-entry-btn guest-entry-btn-primary"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy ? "Working…" : "Start with Face ID"}
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
    </div>
  );
}
