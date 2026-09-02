import { formatLocalizedRelativeTime } from "./relativeTime.js";

export function getFeedActivityKey(postType, hasBook) {
  switch (postType) {
    case "review":
      return "home.activity.review";
    case "finished":
      return "home.activity.finished";
    case "progress":
      return "home.activity.progress";
    case "note":
    default:
      return hasBook
        ? "home.activity.noteWithBook"
        : "home.activity.noteWithoutBook";
  }
}

export function formatFeedRelativeTime(value, t, locale, now = Date.now()) {
  return formatLocalizedRelativeTime(value, {
    now,
    t,
    locale,
    variant: "feed",
  });
}
