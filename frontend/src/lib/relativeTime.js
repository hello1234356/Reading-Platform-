export function formatLocalizedRelativeTime(value, {
  now = Date.now(),
  t,
  locale = "en",
  variant = "feed",
} = {}) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || typeof t !== "function") return "";

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return t(`relativeTime.${variant}.justNow`);

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t(`relativeTime.${variant}.minute`, { count: minutes });
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t(`relativeTime.${variant}.hour`, { count: hours });
  }

  const days = Math.floor(hours / 24);
  if (variant === "notification" && days === 1) {
    return t("relativeTime.notification.yesterday");
  }
  if (days < 7) {
    return t(`relativeTime.${variant}.day`, { count: days });
  }

  return new Date(value).toLocaleDateString(locale);
}
