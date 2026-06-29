import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/discover", label: "Discover" },
  { to: "/clubs", label: "Book Clubs" },
  { to: "/profile", label: "Profile" },
];

function Navbar() {
  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <NavLink className="nav-brand" to="/">
        <span className="brand-mark" aria-hidden="true">L</span>
        <span className="brand-copy">
          <strong>LitShelf</strong>
          <small>Columbia Reading Social</small>
        </span>
      </NavLink>

      <div className="nav-links">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      <NavLink className="nav-login" to="/login">
        Sign in
      </NavLink>
    </nav>
  );
}

export default Navbar;
