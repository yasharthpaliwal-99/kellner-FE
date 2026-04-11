import type { KitchenNavTab } from "../types";
import "./Nav.css";

type Props = {
  active: KitchenNavTab;
  onChange: (t: KitchenNavTab) => void;
};

export function Nav({ active, onChange }: Props) {
  return (
    <nav className="nav-pill" aria-label="Main">
      <button
        type="button"
        className={active === "home" ? "nav-item active" : "nav-item"}
        onClick={() => onChange("home")}
      >
        Home
      </button>
      <button
        type="button"
        className={active === "orders" ? "nav-item active" : "nav-item"}
        onClick={() => onChange("orders")}
      >
        Order list
      </button>
      <button
        type="button"
        className={active === "menu" ? "nav-item active" : "nav-item"}
        onClick={() => onChange("menu")}
      >
        Menu
      </button>
    </nav>
  );
}
