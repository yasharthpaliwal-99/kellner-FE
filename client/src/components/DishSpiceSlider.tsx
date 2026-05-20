import { useEffect, useRef, useState } from "react";
import { spiceSliderLabel } from "../lib/orderSpice";
import "./DishSpiceSlider.css";

type Props = {
  value: number;
  /** Live preview while dragging (optional). */
  onChange?: (level: number) => void;
  /** Fires once when the user releases the thumb (API write). */
  onCommit: (level: number) => void;
  disabled?: boolean;
};

/** 1–4 → mild | low | medium | high (order-level on API). */
export function DishSpiceSlider({ value, onChange, onCommit, disabled }: Props) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (dragValue == null) return;
    setDragValue(null);
  }, [value]);

  const v = Math.min(4, Math.max(1, Math.round(dragValue ?? value)));
  const label = spiceSliderLabel(v);

  const finishDrag = (level: number) => {
    setDragValue(null);
    onChange?.(level);
    commitRef.current(level);
  };

  return (
    <div className={`dish-spice${disabled ? " is-disabled" : ""}`}>
      <span className="dish-spice-label">Spice</span>
      <div className="dish-spice-track-wrap">
        <input
          type="range"
          className="dish-spice-range"
          min={1}
          max={4}
          step={1}
          value={v}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.target.value);
            setDragValue(next);
            onChange?.(next);
          }}
          onPointerUp={(e) => finishDrag(Number(e.currentTarget.value))}
          onTouchEnd={(e) => finishDrag(Number(e.currentTarget.value))}
          onKeyUp={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              finishDrag(Number(e.currentTarget.value));
            }
          }}
          aria-label={`Spice level: ${label}`}
        />
        <div className="dish-spice-ticks" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`dish-spice-tick${i + 1 <= v ? " is-hot" : ""}`} />
          ))}
        </div>
      </div>
      <span className="dish-spice-value">{label}</span>
    </div>
  );
}
