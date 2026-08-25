import { requireSupabase } from "./supabase.js";
import { buildSocialTarget } from "./socialTargets.js";

const NOTIFICATION_LIMIT = 30;

export function safeNotificationTarget(value) {
  const target = String(value || "").trim();
  return target.startsWith("/") && !target.startsWith("//") && target.length <= 500
    ? target : "";
}

export function formatNotificationTime(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function mapNotification(row) {
  const structuredTarget = buildSocialTarget({
    postId: row.post_id,
    commentId: row.comment_id,
    replyId: row.reply_id,
  });
  return {
    id: row.id,
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
  const { data, error } = await supabase.from("notifications").select(`
    id, type, title, body, target_url, target_type, post_id, comment_id, reply_id,
    is_read, created_at,
    actor:profiles!notifications_actor_id_fkey (id, username, full_name, avatar_url)
  `).order("created_at", { ascending: false }).limit(NOTIFICATION_LIMIT);
  if (error) throw error;
  return (data || []).map(mapNotification);
}

export async function getUnreadNotificationCount() {
  const supabase = requireSupabase();
  const { count, error } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true }).eq("is_read", false);
  if (error) throw error;
  return count || 0;
}

export async function markNotificationRead(notificationId) {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
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
  const channel = supabase.channel(`notifications:${userId}`).on(
    "postgres_changes",
    { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
    onChange,
  ).subscribe();
  return () => { void supabase.removeChannel(channel); };
}
