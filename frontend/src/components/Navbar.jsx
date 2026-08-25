import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getAdminRole } from "../lib/adminApi";
import { requireSupabase } from "../lib/supabase";
import tsinglanLogo from "../assets/tsinglan-logo-official-alt.png";
import NotificationInbox from "./NotificationInbox";

const navItems = [
  { to: "/", label: "Reading" },
  { to: "/discover", label: "Discover" },
  { to: "/clubs", label: "Circles" },
  { to: "/profile", label: "Shelf" },
];

function Navbar() {
  const navigate = useNavigate();
  const { user, isLoggedIn, loading } = useAuth();
  const [adminRole, setAdminRole] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminRole() {
      if (loading) return;

      if (!isLoggedIn) {
        setAdminRole(null);
        return;
      }

      try {
        const role = await getAdminRole();
        if (!cancelled) setAdminRole(role);
      } catch (error) {
        console.error("Failed to load admin role:", error);
        if (!cancelled) setAdminRole(null);
      }
    }

    loadAdminRole();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, loading]);

  const visibleNavItems = adminRole
    ? [...navItems, { to: "/admin", label: "Admin" }]
    : navItems;

  function handleSearch(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("site-search") || "").trim();

    if (query) {
      navigate(`/discover?search=${encodeURIComponent(query)}`);
      event.currentTarget.reset();
    } else {
      navigate("/discover");
    }
  }

  async function handleLogout() {
    const supabase = requireSupabase();
    await supabase.auth.signOut();
    navigate("/");
  }

  return (
  <nav
    className={adminRole ? "site-nav site-nav-admin" : "site-nav"}
    aria-label="Primary navigation"
  >
    <NavLink
      className="nav-brand"
      to="/"
      aria-label="LitShelf home"
    >
      <img
        className="litshelf-logo"
        src="/branding/litshelf-logo9.svg"
        alt="LitShelf — Tsinglan Reading Social"
      />
    </NavLink>

    <div className="nav-center">
      <div className="nav-links">
        {visibleNavItems.map((item) => (
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

      <form
        className="nav-search"
        role="search"
        onSubmit={handleSearch}
      >
        <input
          name="site-search"
          type="search"
          placeholder="Search books..."
          aria-label="Search books"
        />

        <button type="submit" aria-label="Search">
          ⌕
        </button>
      </form>

      {isLoggedIn ? (
        <button
          className="nav-login"
          type="button"
          onClick={handleLogout}
        >
          Log out
        </button>
      ) : (
        <NavLink className="nav-login" to="/login">
          Sign in
        </NavLink>
      )}
    </div>

    <div className="nav-school-actions">
      {isLoggedIn && user?.id ? <NotificationInbox userId={user.id} /> : null}
      <img
        className="school-logo"
        src={tsinglanLogo}
        alt="Tsinglan School"
      />
    </div>
  </nav>
);
}

export default Navbar;
