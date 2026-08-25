function positiveId(value) {
  const normalized = String(value || "").trim();
  return /^\d+$/.test(normalized) && normalized !== "0" ? normalized : "";
}

export function buildSocialTarget({ postId, commentId, replyId } = {}) {
  const post = positiveId(postId);
  if (!post) return "";
  const params = new URLSearchParams();
  const comment = positiveId(commentId);
  const reply = positiveId(replyId);
  if (comment) params.set("comment", comment);
  if (reply && comment) params.set("reply", reply);
  const query = params.toString();
  return `/post/${post}${query ? `?${query}` : ""}`;
}

export function resolveSocialTarget({ pathname = "", search = "" } = {}) {
  const routeMatch = String(pathname).match(/^\/post\/(\d+)\/?$/);
  const params = new URLSearchParams(search);
  const postId = positiveId(routeMatch?.[1] || params.get("post"));
  if (!postId) return null;
  const commentId = positiveId(params.get("comment"));
  const replyId = commentId ? positiveId(params.get("reply")) : "";
  return { postId, commentId, replyId };
}
