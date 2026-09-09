import TalesCollectible from "./tales/TalesCollectible";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import UserAvatar from "./UserAvatar";
import {
  formatNotificationTime,
  getLocalizedNotificationTitle,
  getNotifications,
  getUnreadNotificationCount,
  isExternalNotificationTarget,
  markAllNotificationsRead,
  markNotificationsRead,
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
  const { t, i18n } = useTranslation();
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);
  const firstActionRef = useRef(null);
  const openRef = useRef(false);
  const itemsRef = useRef([]);
  const readWriteRef = useRef(null);
  const confirmedReadRef = useRef(new Set());
  const refreshVersionRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  async function refresh({ includeItems = openRef.current } = {}) {
    const version = ++refreshVersionRef.current;
    try {
      await readWriteRef.current;
      const [count, nextItems] = await Promise.all([
        getUnreadNotificationCount(),
        includeItems || confirmedReadRef.current.size
          ? getNotifications() : Promise.resolve(null),
      ]);
      if (version !== refreshVersionRef.current) return;
      // A late/stale inbox response cannot undo a successful acknowledgement.
      const staleUnread = (nextItems || []).filter((item) => (
        !item.isRead && confirmedReadRef.current.has(`${item.itemKind}:${item.id}`)
      )).length;
      setUnreadCount(Math.max(0, count - staleUnread));
      if (nextItems) {
        const reconciledItems = nextItems.map((item) => (
          confirmedReadRef.current.has(`${item.itemKind}:${item.id}`)
            ? { ...item, isRead: true } : item
        ));
        itemsRef.current = reconciledItems;
        setItems(reconciledItems);
      }
      setStatus("ready");
      setMessage("");
    } catch (error) {
      if (version !== refreshVersionRef.current) return;
      console.error("Failed to load notifications:", error);
      setStatus("error");
      setMessage(t("notifications.unavailable"));
    }
  }

  useEffect(() => {
    // Initial remote synchronization for the authenticated recipient.
    void refresh({ includeItems: false });
    return subscribeToNotifications(userId, () => void refresh());
    // Read current panel state without resubscribing on every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!open) return undefined;
    // Opening the panel requests its bounded inbox contents.
    void refresh({ includeItems: true });
    const handlePointer = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        closePanel();
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        closePanel();
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

  function markLoadedRead(snapshot) {
    const unread = snapshot.filter((item) => !item.isRead);
    if (!unread.length) return;
    ++refreshVersionRef.current;
    itemsRef.current = snapshot.map((item) => ({ ...item, isRead: true }));
    setItems(itemsRef.current);
    setUnreadCount((count) => Math.max(0, count - unread.length));
    const previous = readWriteRef.current;
    const write = (async () => {
      await previous;
      try {
        await markNotificationsRead(unread);
        unread.forEach((item) => confirmedReadRef.current.add(`${item.itemKind}:${item.id}`));
      }
      catch (error) {
        console.error("Failed to mark notifications read:", error);
        setMessage(t("notifications.unavailable"));
        // Reconcile with the server without marking later arrivals read.
        void refresh({ includeItems: true });
      }
    })();
    readWriteRef.current = write;
  }

  function closePanel() {
    if (!openRef.current) return;
    openRef.current = false;
    // Event listeners use the latest loaded data, including realtime arrivals.
    markLoadedRead(itemsRef.current);
    setOpen(false);
  }

  function togglePanel() {
    if (openRef.current) closePanel();
    else {
      openRef.current = true;
      setOpen(true);
    }
  }

  async function openNotification(item) {
    closePanel();
    if (item.targetUrl) {
      if (isExternalNotificationTarget(item.targetUrl)) {
        window.open(item.targetUrl, "_blank", "noopener,noreferrer");
      } else {
        navigate(item.targetUrl);
      }
    }
  }

  async function markAll() {
    itemsRef.current = itemsRef.current.map((item) => ({ ...item, isRead: true }));
    setItems(itemsRef.current);
    setUnreadCount(0);
    try { await markAllNotificationsRead(); }
    catch (error) { console.error("Failed to mark notifications read:", error); void refresh(); }
  }

  return (
    <div className="notification-mailbox" ref={wrapperRef}>
      <button className="notification-mailbox-button" type="button"
        aria-label={unreadCount ? t("notifications.unread", { count: unreadCount }) : t("notifications.title")}
        aria-haspopup="dialog" aria-expanded={open} aria-controls="notification-inbox-panel"
        onClick={togglePanel}>
        <MailboxIcon />
        {unreadCount > 0 ? (
          <span className="notification-unread-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section className="notification-inbox-panel" id="notification-inbox-panel" ref={panelRef}
          role="dialog" aria-label={t("notifications.title")}>
          <header className="notification-inbox-header">
            <h2>{t("notifications.title")}</h2>
            {unreadCount > 0 ? (
              <button ref={firstActionRef} type="button" onClick={markAll}>{t("notifications.markAll")}</button>
            ) : null}
          </header>
          {message ? <p className="notification-inbox-state" role="alert">{message}</p> : null}
          {status === "loading" ? <p className="notification-inbox-state">{t("notifications.loading")}</p> : null}
          {status === "ready" && items.length === 0 ? (
            <p className="notification-inbox-state">{t("notifications.empty")}</p>
          ) : null}
          <TalesCollectible letter="E" placement="inbox" />
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
                  <strong>{getLocalizedNotificationTitle(item, t)}</strong>
                  {item.body ? <span>{item.body}</span> : null}
                  <time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt, {
                    t,
                    locale: i18n.resolvedLanguage,
                  })}</time>
                </span>
                {!item.isRead ? <span className="notification-unread-dot" aria-label={t("notifications.unreadLabel")} /> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default NotificationInbox;
