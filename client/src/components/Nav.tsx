import "./Nav.css";

type Tab = "home" | "orders";

type Props = {
  active: Tab;
  onChange: (t: Tab) => void;
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
    </nav>
  );
}
