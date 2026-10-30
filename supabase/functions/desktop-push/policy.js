// Shared, side-effect-free delivery policy. Never forward inbox message bodies or authored titles.
export function validPushEndpoint(value) {
  try {
    const url = new URL(value);
    return typeof value === 'string' && value.length <= 2048 && url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash && url.pathname.length > 1 &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(url.hostname);
  } catch { return false; }
}
export function pushTarget(notification) {
  if (/^[1-9]\d*$/.test(String(notification.post_id || ''))) {
    const params = new URLSearchParams();
    if (/^[1-9]\d*$/.test(String(notification.comment_id || ''))) {
      params.set('comment', notification.comment_id);
      if (/^[1-9]\d*$/.test(String(notification.reply_id || ''))) params.set('reply', notification.reply_id);
    }
    return `/post/${notification.post_id}${params.size ? `?${params}` : ''}`;
  }
  const target = notification.target_url;
  if (typeof target !== 'string' || target.length > 500 || !/^\/(?:clubs(?:\/\d+)?|post\/\d+|discover|profile|events(?:\/[^/?#]+)?)(?:\?[^#]*)?$/.test(target) || /[\\\s\u0000-\u001f]/.test(target)) return '/?inbox=1';
  return target;
}
export function viewingTarget(presence, target) {
  if (presence.inbox_open) return true;
  try {
    const current = new URL(presence.route, 'https://litshelf.invalid');
    const next = new URL(target, 'https://litshelf.invalid');
    if (current.pathname !== next.pathname || target === '/?inbox=1') return false;
    if (/^\/clubs\/\d+$/.test(next.pathname)) return Boolean(next.searchParams.get('channel')) && current.searchParams.get('channel') === next.searchParams.get('channel');
    // A post is relevant only when the same comment/reply is open.
    return ['comment','reply','bookId'].every(key => !next.searchParams.has(key) || current.searchParams.get(key) === next.searchParams.get(key));
  } catch { return false; }
}
export function pushBody(notification, actorName, language = 'en') {
  const zh = language === 'zh';
  const actor = String(actorName || (zh ? '一位读者' : 'A reader')).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 60);
  switch (notification.type) {
    case 'mention': return zh ? `${actor}${notification.target_type === 'club_message' ? ' 在阅读圈中提到了你。' : ' 提到了你。'}` : `${actor}${notification.target_type === 'club_message' ? ' mentioned you in a club.' : ' mentioned you.'}`;
    case 'reply': return zh ? `${actor} 回复了你。` : `${actor} replied to you.`;
    case 'comment': return zh ? `${actor} 评论了你的帖子。` : `${actor} commented on your post.`;
    case 'reaction': return zh ? `${actor} 赞了你的内容。` : `${actor} liked your content.`;
    case 'book_submission_approved': return zh ? '你提交的书籍已通过审核。' : 'Your book submission was approved.';
    case 'book_submission_rejected': return zh ? '你提交的书籍有审核更新。' : 'There is an update on your book submission.';
    default: return zh ? 'LitShelf 收件箱有新通知。' : 'You have a new LitShelf inbox notification.';
  }
}
export function eligibleNotification(notification, userId) {
  return !notification.is_read && (!notification.recipient_id || notification.recipient_id === userId) && notification.actor_id !== userId &&
    !['club_message', 'club_notice', 'group_notice'].includes(notification.type) &&
    !['club_notice', 'group_notice'].includes(notification.target_type) &&
    (notification.target_type !== 'club_message' || notification.type === 'mention');
}
