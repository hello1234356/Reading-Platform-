import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserAvatar from "./UserAvatar";
import {
  formatNotificationTime,
  getNotifications,
  getUnreadNotificationCount,
  isExternalNotificationTarget,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "../lib/notificationApi";
import { getNotificationPanelHeight } from "../lib/notificationLayout";

function MailboxIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </svg>
  );
}

function NotificationInbox({ userId }) {
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);
  const firstActionRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  async function refresh({ includeItems = open } = {}) {
    try {
      const [count, nextItems] = await Promise.all([
        getUnreadNotificationCount(),
        includeItems ? getNotifications() : Promise.resolve(null),
      ]);
      setUnreadCount(count);
      if (nextItems) setItems(nextItems);
      setStatus("ready");
      setMessage("");
    } catch (error) {
      console.error("Failed to load notifications:", error);
      setStatus("error");
      setMessage("Notifications are unavailable right now.");
    }
  }

  useEffect(() => {
    // Initial remote synchronization for the authenticated recipient.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh({ includeItems: false });
    return subscribeToNotifications(userId, () => void refresh({ includeItems: open }));
    // The subscription is recreated when panel state changes so its callback has current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, open]);

  useEffect(() => {
    if (!open) return undefined;
    // Opening the panel requests its bounded inbox contents.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh({ includeItems: true });
    const handlePointer = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        wrapperRef.current?.querySelector(".notification-mailbox-button")?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.requestAnimationFrame(() => firstActionRef.current?.focus());
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return undefined;

    const syncPanelHeight = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const viewport = window.visualViewport;
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const height = getNotificationPanelHeight(
        panel.getBoundingClientRect().top,
        viewportBottom,
      );
      panel.style.setProperty("--notification-panel-height", `${height}px`);
    };

    syncPanelHeight();
    window.addEventListener("resize", syncPanelHeight);
    window.visualViewport?.addEventListener("resize", syncPanelHeight);
    window.visualViewport?.addEventListener("scroll", syncPanelHeight);
    return () => {
      window.removeEventListener("resize", syncPanelHeight);
      window.visualViewport?.removeEventListener("resize", syncPanelHeight);
      window.visualViewport?.removeEventListener("scroll", syncPanelHeight);
    };
  }, [open, items.length, message, status]);

  async function openNotification(item) {
    if (!item.isRead) {
      setItems((current) => current.map((entry) => (
        entry.id === item.id && entry.itemKind === item.itemKind
      )
        ? { ...entry, isRead: true } : entry));
      setUnreadCount((count) => Math.max(0, count - 1));
      try { await markNotificationRead(item); }
      catch (error) { console.error("Failed to mark notification read:", error); void refresh(); }
    }
    setOpen(false);
    if (item.targetUrl) {
      if (isExternalNotificationTarget(item.targetUrl)) {
        window.open(item.targetUrl, "_blank", "noopener,noreferrer");
      } else {
        navigate(item.targetUrl);
      }
    }
  }

  async function markAll() {
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    try { await markAllNotificationsRead(); }
    catch (error) { console.error("Failed to mark notifications read:", error); void refresh(); }
  }

  return (
    <div className="notification-mailbox" ref={wrapperRef}>
      <button className="notification-mailbox-button" type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="notification-inbox-panel"
        onClick={() => setOpen((value) => !value)}>
        <MailboxIcon />
        {unreadCount > 0 ? (
          <span className="notification-unread-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section className="notification-inbox-panel" id="notification-inbox-panel" ref={panelRef}
          role="dialog" aria-label="Notifications">
          <header className="notification-inbox-header">
            <h2>Notifications</h2>
            {unreadCount > 0 ? (
              <button ref={firstActionRef} type="button" onClick={markAll}>Mark all as read</button>
            ) : null}
          </header>
          {message ? <p className="notification-inbox-state" role="alert">{message}</p> : null}
          {status === "loading" ? <p className="notification-inbox-state">Loading...</p> : null}
          {status === "ready" && items.length === 0 ? (
            <p className="notification-inbox-state">You&apos;re all caught up.</p>
          ) : null}
          <div className="notification-inbox-list">
            {items.map((item) => (
              <button key={`${item.itemKind}:${item.id}`} type="button"
                className={`notification-inbox-row notification-inbox-row--${item.type}${
                  item.isRead ? "" : " unread"
                }`}
                onClick={() => openNotification(item)}>
                {item.actor ? <UserAvatar avatarUrl={item.actor.avatarUrl}
                  name={item.actor.name} size="small" /> : (
                  <span className="notification-system-mark" aria-hidden="true"><MailboxIcon /></span>
                )}
                <span className="notification-inbox-copy">
                  <strong>{item.title}</strong>
                  {item.body ? <span>{item.body}</span> : null}
                  <time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time>
                </span>
                {!item.isRead ? <span className="notification-unread-dot" aria-label="Unread" /> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default NotificationInbox;
