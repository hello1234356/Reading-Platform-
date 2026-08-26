import { requireSupabase } from "./supabase";
import { getPublicDisplayName } from "./identity";
import { requireModeratedContent } from "./moderationApi";
import { getPreferredGoogleBooksCoverUrl } from "./googleBooks";

function getPostAction(postType, hasBook) {
  switch (postType) {
    case "review":
      return "reviewed";
    case "finished":
      return "finished";
    case "progress":
      return "updated progress on";
    case "note":
    default:
      return hasBook
      ? "posted a note about"
      : "posted a reading note";
  }
}

function formatRelativeTime(createdAt) {
  if (!createdAt) {
    return "";
  }

  const createdTime = new Date(createdAt).getTime();
  const secondsAgo = Math.max(
    0,
    Math.floor((Date.now() - createdTime) / 1000),
  );

  if (secondsAgo < 60) {
    return "just now";
  }

  const minutesAgo = Math.floor(secondsAgo / 60);

  if (minutesAgo < 60) {
    return `${minutesAgo} min ago`;
  }

  const hoursAgo = Math.floor(minutesAgo / 60);

  if (hoursAgo < 24) {
    return `${hoursAgo} hr${hoursAgo === 1 ? "" : "s"} ago`;
  }

  const daysAgo = Math.floor(hoursAgo / 24);

  if (daysAgo < 7) {
    return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
  }

  return new Date(createdAt).toLocaleDateString();
}

function mapComment(row, currentUserId = null) {
  const likes = Array.isArray(row.comment_likes)
    ? row.comment_likes
    : [];

  return {
    id: row.id,
    userId: row.user_id,
    text: row.comment,
    parentCommentId: row.parent_comment_id || null,
    isReply: Boolean(row.parent_comment_id),

    commenterName:
      getPublicDisplayName(row.profiles),

    commenterUsername:
      row.profiles?.username || "",

    commenterAvatarUrl:
      row.profiles?.avatar_url || "",

    mentionedUserId:
      row.mentioned_user_id || null,

    mentionedUsername:
      row.mentioned_profile?.username || "",

    mentionedName:
      getPublicDisplayName(
        row.mentioned_profile,
      ),

    createdAt: row.created_at,
    likes: likes.length,
    liked: currentUserId
      ? likes.some((like) => like.user_id === currentUserId)
      : false,
  };
}

function mapPost(row, currentUserId = null) {
  const profile = row.profiles;
  const book = row.books;

  const likes = Array.isArray(row.post_likes)
    ? row.post_likes
    : [];

  const comments = Array.isArray(row.comments)
    ? [...row.comments]
        .sort(
          (first, second) =>
            new Date(first.created_at) - new Date(second.created_at),
        )
        .map((comment) => mapComment(comment, currentUserId))
    : [];

  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,

    student: getPublicDisplayName(profile),
    avatarUrl: profile?.avatar_url || "",

    action: getPostAction(row.post_type, Boolean(book)),
    postType: row.post_type || "note",
    hasBook: Boolean(book),

    book: book?.title || "Untitled",
    title: book?.title || "Untitled",
    author: book?.author || "Unknown author",
    isbn: book?.isbn || "",
    description: book?.description || "",
    source: book?.source || "",
    externalId: book?.external_id || "",
    googleBooksId:
      book?.source === "google_books" ? book.external_id || "" : "",
    storedCoverUrl: book?.cover_url || "",
    coverUrl: getPreferredGoogleBooksCoverUrl(
      book?.cover_url,
      book?.isbn,
    ),
    genre: book?.genre || "Reading",

    note: row.note || "",
    progress: Number(row.progress ?? 0),
    rating: Number(row.rating ?? 0),

    likes: likes.length,
    liked: currentUserId
      ? likes.some((like) => like.user_id === currentUserId)
      : false,

    comments,
    draftComment: "",

    createdAt: row.created_at,
    time: formatRelativeTime(row.created_at),
  };
}

const FEED_SELECT = `
  id,
  user_id,
  book_id,
  note,
  progress,
  rating,
  post_type,
  created_at,

  profiles!posts_user_id_fkey (
    id,
    full_name,
    username,
    avatar_url
  ),

  books!posts_book_id_fkey (
    id,
    title,
    author,
    isbn,
    cover_url,
    genre,
    description,
    source,
    external_id
  ),

  comments (
    id,
    post_id,
    user_id,
    mentioned_user_id,
    parent_comment_id,
    comment,
    created_at,

    profiles!comments_user_id_fkey (
      id,
      full_name,
      username,
      avatar_url
    ),

    mentioned_profile:profiles!comments_mentioned_user_id_fkey (
      id,
      full_name,
      username
    )
  ),

  post_likes (
    post_id,
    user_id,
    created_at
  )
`;

function escapeLikePattern(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function isMissingCommentLikesTableError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST204" ||
    (
      message.includes("comment_likes") &&
      (
        message.includes("schema cache") ||
        message.includes("could not find the table") ||
        message.includes("does not exist")
      )
    )
  );
}

async function getBookIdsByTitle(searchTerm) {
  const cleanedSearch = String(searchTerm || "").trim();

  if (!cleanedSearch) return null;

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("books")
    .select("id")
    .ilike("title", `%${escapeLikePattern(cleanedSearch)}%`)
    .limit(200);

  if (error) throw error;

  return (data || []).map((book) => book.id);
}

async function attachCommentLikes(posts) {
  const rows = Array.isArray(posts) ? posts : [];
  const commentIds = rows.flatMap((post) =>
    Array.isArray(post.comments)
      ? post.comments.map((comment) => comment.id).filter(Boolean)
      : [],
  );

  if (commentIds.length === 0) {
    return rows;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("comment_likes")
    .select("comment_id, user_id, created_at")
    .in("comment_id", commentIds);

  if (error) {
    if (isMissingCommentLikesTableError(error)) {
      console.warn(
        "comment_likes table is missing; loading feed without comment likes.",
      );

      return rows;
    }

    throw error;
  }

  const likesByCommentId = new Map();

  for (const like of data || []) {
    const existing = likesByCommentId.get(like.comment_id) || [];
    existing.push(like);
    likesByCommentId.set(like.comment_id, existing);
  }

  return rows.map((post) => ({
    ...post,
    comments: Array.isArray(post.comments)
      ? post.comments.map((comment) => ({
          ...comment,
          comment_likes: likesByCommentId.get(comment.id) || [],
        }))
      : [],
  }));
}

export async function getFeedPosts(
  currentUserId = null,
  { page = 1, pageSize = 15, bookTitleQuery = "" } = {},
) {
  const supabase = requireSupabase();
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedPageSize = Math.max(
    Math.min(Number(pageSize) || 15, 20),
    1,
  );
  const from = (normalizedPage - 1) * normalizedPageSize;
  const to = from + normalizedPageSize - 1;
  const matchingBookIds = await getBookIdsByTitle(bookTitleQuery);

  if (matchingBookIds && matchingBookIds.length === 0) {
    return {
      posts: [],
      totalCount: 0,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  let query = supabase
    .from("posts")
    .select(FEED_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (matchingBookIds) {
    query = query.in("book_id", matchingBookIds);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw error;
  }

  const postsWithCommentLikes = await attachCommentLikes(data || []);

  return {
    posts: postsWithCommentLikes.map((row) =>
      mapPost(row, currentUserId),
    ),
    totalCount: count || 0,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}

export async function createPost({
  userId,
  bookId,
  note,
  postType = "note",
  progress = 0,
  rating = 0,
  allowModerationWarning = false,
}) {
  if (!userId) {
    throw new Error("You must be logged in to publish a post.");
  }

  if (postType !== "note" && !bookId) {
  throw new Error("This type of post must be connected to a book.");
}

  const moderation = await requireModeratedContent({
    text: note,
    contextType:
      postType === "review"
        ? "feed_review"
        : "feed_post",
    allowWarningOverride: allowModerationWarning,
  });

  const cleanedNote = moderation.approvedText;

  const allowedPostTypes = [
    "note",
    "review",
    "progress",
    "finished",
  ];

  if (!allowedPostTypes.includes(postType)) {
    throw new Error("That post type is not valid.");
  }

  const numericProgress = Number(progress);
  const numericRating = Number(rating);

  if (
    Number.isNaN(numericProgress) ||
    numericProgress < 0 ||
    numericProgress > 100
  ) {
    throw new Error("Progress must be between 0 and 100.");
  }

  if (
    Number.isNaN(numericRating) ||
    numericRating < 0 ||
    numericRating > 5
  ) {
    throw new Error("Rating must be between 0 and 5.");
  }
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: userId,
      book_id: bookId || null,
      note: cleanedNote,
      post_type: postType,
      progress: Math.round(numericProgress),
      rating: numericRating,
      mood: null,
      place: null,
    })
    .select(FEED_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapPost(data, userId);
}

export async function likePost({postId, userId}) {
  if (!postId || !userId) {
    throw new Error("The post or user is missing.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("post_likes")
    .insert({
      post_id: postId,
      user_id: userId,
    });

  if (error) {
    if (error.code === "23505") {
      return;
    }

    throw error;
  }
}

export async function unlikePost({postId, userId}) {
  if (!postId || !userId) {
    throw new Error("The post or user is missing.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function likeComment({ commentId, userId }) {
  if (!commentId || !userId) {
    throw new Error("The comment or user is missing.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("comment_likes")
    .insert({
      comment_id: commentId,
      user_id: userId,
    });

  if (error) {
    if (error.code === "23505") {
      return;
    }

    if (isMissingCommentLikesTableError(error)) {
      console.warn(
        "comment_likes table is missing; comment like was not saved.",
      );
      return;
    }

    throw error;
  }
}

export async function unlikeComment({ commentId, userId }) {
  if (!commentId || !userId) {
    throw new Error("The comment or user is missing.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("comment_likes")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", userId);

  if (error) {
    if (isMissingCommentLikesTableError(error)) {
      console.warn(
        "comment_likes table is missing; comment unlike was not saved.",
      );
      return;
    }

    throw error;
  }
}

export async function addPostComment({
  postId,
  userId,
  comment,
  mentionedUserId = null,
  parentCommentId = null,
  allowModerationWarning = false,
}) {
  if (!postId) {
    throw new Error("This comment is missing its post.");
  }

  if (!userId) {
    throw new Error("You must be logged in to comment.");
  }

  const moderation = await requireModeratedContent({
    text: comment,
    contextType: "feed_comment",
    allowWarningOverride: allowModerationWarning,
  });

  const cleanedComment = moderation.approvedText; 

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      user_id: userId,
      mentioned_user_id:
        mentionedUserId || null,
      parent_comment_id: parentCommentId || null,
      comment: cleanedComment,
    })
    .select(`
      id,
      post_id,
      user_id,
      mentioned_user_id,
      parent_comment_id,
      comment,
      created_at,

      profiles!comments_user_id_fkey (
        id,
        full_name,
        username
      ),

      mentioned_profile:profiles!comments_mentioned_user_id_fkey (
        id,
        full_name,
        username
      )
    `)
    .single();

  if (error) {
    throw error;
  }

  return mapComment(data, userId);
}

export async function deletePostComment(commentId, userId) {
  if (!commentId || !userId) {
    throw new Error("The comment or user is missing.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function deletePost(postId, userId) {
  if (!postId || !userId) {
    throw new Error("The post or user is missing.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
