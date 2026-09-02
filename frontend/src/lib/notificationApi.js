import { requireSupabase } from "./supabase.js";
import { buildSocialTarget } from "./socialTargets.js";
import { formatLocalizedRelativeTime } from "./relativeTime.js";

const NOTIFICATION_LIMIT = 30;

export function safeNotificationTarget(value) {
  const target = String(value || "").trim();
  const isInternal = target.startsWith("/") && !target.startsWith("//");
  const isExternal = isExternalNotificationTarget(target);
  return target.length <= 500 && (isInternal || isExternal) ? target : "";
}

export function isExternalNotificationTarget(value) {
  const target = String(value || "").trim();
  if (!/^https:\/\//i.test(target)) return false;
  try {
    return new URL(target).protocol === "https:";
  } catch {
    return false;
  }
}

export function formatNotificationTime(value, options = {}) {
  return formatLocalizedRelativeTime(value, {
    ...options,
    variant: "notification",
  });
}

export function getLocalizedNotificationTitle(notification, t) {
  if (!notification || typeof t !== "function") return notification?.title || "";
  const actor = notification.actor?.name || t("notifications.reader");

  switch (notification.type) {
    case "reply":
      return t("notifications.replied", { actor });
    case "comment":
      return t("notifications.commented", { actor });
    case "mention":
      return t(notification.replyId
        ? "notifications.mentionedReply"
        : "notifications.mentionedComment", { actor });
    case "reaction":
      if (notification.targetType === "comment_like") {
        return t(notification.replyId
          ? "notifications.likedReply"
          : "notifications.likedComment", { actor });
      }
      return t(notification.body
        ? "notifications.likedReview"
        : "notifications.likedPost", { actor });
    case "book_submission_approved":
      return t("notifications.bookApproved");
    case "book_submission_rejected":
      return t("notifications.bookRejected");
    default:
      // Admin-authored announcements and unknown future notification types are
      // content, not LitShelf sentence templates, so preserve their title.
      return notification.title || "";
  }
}

function mapNotification(row) {
  const structuredTarget = buildSocialTarget({
    postId: row.post_id,
    commentId: row.comment_id,
    replyId: row.reply_id,
  });
  return {
    id: row.id,
    itemKind: row.item_kind || "personal",
    type: row.type,
    title: row.title || "Notification",
    body: row.body || "",
    targetUrl: structuredTarget || safeNotificationTarget(row.target_url),
    targetType: row.target_type || "",
    postId: row.post_id || null,
    commentId: row.comment_id || null,
    replyId: row.reply_id || null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    actor: row.actor ? {
      id: row.actor.id,
      name: row.actor.full_name || row.actor.username || "A reader",
      avatarUrl: row.actor.avatar_url || "",
    } : null,
  };
}

export async function getNotifications() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_notification_inbox", {
    p_limit: NOTIFICATION_LIMIT,
  });
  if (error) throw error;
  return (data || []).map(mapNotification);
}

export async function getUnreadNotificationCount() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) throw error;
  return Number(data) || 0;
}

export async function markNotificationRead(notification) {
  const supabase = requireSupabase();
  const isPublicAnnouncement = notification?.itemKind === "public_announcement";
  const { error } = await supabase.rpc(
    isPublicAnnouncement ? "mark_public_announcement_read" : "mark_notification_read",
    isPublicAnnouncement
      ? { p_announcement_id: notification.id }
      : { p_notification_id: notification.id },
  );
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

export function subscribeToNotifications(userId, onChange) {
  if (!userId) return () => {};
  const supabase = requireSupabase();
  const channel = supabase.channel(`notifications:${userId}`)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}`,
    }, onChange)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "public_announcements",
    }, onChange)
    .on("postgres_changes", {
      event: "*", schema: "public", table: "public_announcement_reads",
      filter: `user_id=eq.${userId}`,
    }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
