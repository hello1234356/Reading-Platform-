import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import {
  getAdminNotificationSummary,
  getAdminRole,
} from "../lib/adminApi";
import { requireSupabase } from "../lib/supabase";
import tsinglanLogo from "../assets/tsinglan-logo-official-alt.png";
import NotificationInbox from "./NotificationInbox";
import LanguageSwitcher from "./LanguageSwitcher";

const navItems = [
  { to: "/", labelKey: "nav.reading" },
  { to: "/discover", labelKey: "nav.discover" },
  { to: "/clubs", labelKey: "nav.circles" },
  { to: "/profile", labelKey: "nav.shelf" },
];

function Navbar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isLoggedIn, loading } = useAuth();
  const [adminRole, setAdminRole] = useState(null);
  const [adminNotificationsOpen, setAdminNotificationsOpen] =
    useState(false);
  const adminNotificationRef = useRef(null);
  const [adminNotifications, setAdminNotifications] = useState({
    moderationCount: 0,
    bookSubmissionCount: 0,
    clubMessageCount: 0,
    total: 0,
  });

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

  useEffect(() => {
    if (!adminRole) {
      setAdminNotificationsOpen(false);
      setAdminNotifications({
        moderationCount: 0,
        bookSubmissionCount: 0,
        clubMessageCount: 0,
        total: 0,
      });
      return undefined;
    }

    let cancelled = false;

    async function loadAdminNotifications() {
      try {
        const summary = await getAdminNotificationSummary();
        if (!cancelled) setAdminNotifications(summary);
      } catch (error) {
        console.error("Failed to load admin notifications:", error);
      }
    }

    loadAdminNotifications();

    const supabase = requireSupabase();
    const channel = supabase
      .channel("admin-navbar-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "moderation_reports",
        },
        loadAdminNotifications,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "book_submissions",
        },
        loadAdminNotifications,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "club_message_moderation_reports",
        },
        loadAdminNotifications,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [adminRole]);

  useEffect(() => {
    if (!adminNotificationsOpen) return undefined;

    function closeAdminNotifications(event) {
      if (
        adminNotificationRef.current &&
        !adminNotificationRef.current.contains(event.target)
      ) {
        setAdminNotificationsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeAdminNotifications);

    return () => {
      document.removeEventListener("pointerdown", closeAdminNotifications);
    };
  }, [adminNotificationsOpen]);

  const visibleNavItems = adminRole
    ? [...navItems, { to: "/admin", labelKey: "nav.admin" }]
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
    aria-label={t("nav.primary")}
  >
    <NavLink
      className="nav-brand"
      to="/"
      aria-label={t("nav.home")}
    >
      <img
        className="litshelf-logo"
        src="/branding/litshelf-logo9.svg"
        alt="LitShelf — Tsinglan Reading Social"
      />
    </NavLink>

    <div className="nav-links">
      {visibleNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          <span>{t(item.labelKey)}</span>
        </NavLink>
      ))}
    </div>

    <div className="nav-school-actions nav-actions">
      <form
        className="nav-search"
        role="search"
        onSubmit={handleSearch}
      >
        <input
          name="site-search"
          type="search"
          placeholder={t("nav.searchPlaceholder")}
          aria-label={t("nav.searchBooks")}
        />

        <button type="submit" aria-label={t("common.search")}>
          <span aria-hidden="true">⌕</span>
        </button>
      </form>

      {isLoggedIn ? (
        <button
          className="nav-login"
          type="button"
          onClick={handleLogout}
        >
          {t("common.logOut")}
        </button>
      ) : (
        <NavLink className="nav-login" to="/login">
          {t("common.signIn")}
        </NavLink>
      )}
      {isLoggedIn && user?.id ? <NotificationInbox userId={user.id} /> : null}

      {adminRole ? (
        <div
          className="admin-notification-center"
          ref={adminNotificationRef}
        >
          <button
            className="admin-notification-trigger"
            type="button"
            aria-label={t("nav.adminNotifications")}
            aria-expanded={adminNotificationsOpen}
            onClick={() =>
              setAdminNotificationsOpen((open) => !open)
            }
          >
            <span aria-hidden="true">!</span>
            {adminNotifications.total > 0 ? (
              <strong>{adminNotifications.total}</strong>
            ) : null}
          </button>

          {adminNotificationsOpen ? (
            <div className="admin-notification-popover">
              <div>
                <p className="eyebrow">{t("nav.adminNotifications")}</p>
                <h2>{t("nav.sharedQueue")}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdminNotificationsOpen(false);
                  navigate("/admin");
                }}
              >
                {t("nav.openAdmin")}
              </button>
              <ul>
                <li>
                  <span>{t("nav.moderation")}</span>
                  <strong>{adminNotifications.moderationCount}</strong>
                </li>
                <li>
                  <span>{t("nav.bookRequests")}</span>
                  <strong>{adminNotifications.bookSubmissionCount}</strong>
                </li>
                <li>
                  <span>{t("nav.clubReports")}</span>
                  <strong>{adminNotifications.clubMessageCount}</strong>
                </li>
              </ul>
              <small>
                {t("nav.queueHelp")}
              </small>
            </div>
          ) : null}
        </div>
      ) : null}

      <LanguageSwitcher />

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
