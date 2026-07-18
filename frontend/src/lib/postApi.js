import { requireSupabase } from "./supabase";

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

function mapComment(row) {
  const commenterName =
    row.profiles?.full_name ||
    row.profiles?.username ||
    "Reader";

  return {
    id: row.id,
    userId: row.user_id,
    text: row.comment,
    commenterName,
    createdAt: row.created_at,
  };
}

function mapPost(row, currentUserId = null) {
  const profile = row.profiles;
  const book = row.books;

  const student =
    profile?.full_name ||
    profile?.username ||
    "Tsinglan Reader";

  const likes = Array.isArray(row.post_likes)
    ? row.post_likes
    : [];

  const comments = Array.isArray(row.comments)
    ? [...row.comments]
        .sort(
          (first, second) =>
            new Date(first.created_at) - new Date(second.created_at),
        )
        .map(mapComment)
    : [];

  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,

    student,
    username: profile?.username || "",
    avatarUrl: profile?.avatar_url || "",

    action: getPostAction(row.post_type, Boolean(book)),
    postType: row.post_type || "note",
    hasBook: Boolean(book),

    book: book?.title || "Untitled",
    author: book?.author || "Unknown author",
    isbn: book?.isbn || "",
    coverUrl: book?.cover_url || "",
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
    genre
  ),

  comments (
    id,
    post_id,
    user_id,
    comment,
    created_at,

    profiles!comments_user_id_fkey (
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

export async function getFeedPosts(currentUserId = null) {
  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("posts")
    .select(FEED_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) =>
    mapPost(row, currentUserId),
  );
}

export async function createPost({
  userId,
  bookId,
  note,
  postType = "note",
  progress = 0,
  rating = 0,
}) {
  if (!userId) {
    throw new Error("You must be logged in to publish a post.");
  }

  if (postType !== "note" && !bookId) {
  throw new Error("This type of post must be connected to a book.");
}

  const cleanedNote = note?.trim();

  if (!cleanedNote) {
    throw new Error("Please write something before publishing.");
  }

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

export async function addPostComment({
  postId,
  userId,
  comment,
}) {
  if (!postId) {
    throw new Error("This comment is missing its post.");
  }

  if (!userId) {
    throw new Error("You must be logged in to comment.");
  }

  const cleanedComment = comment?.trim();

  if (!cleanedComment) {
    throw new Error("Please write a comment first.");
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: postId,
      user_id: userId,
      comment: cleanedComment,
    })
    .select(`
      id,
      post_id,
      user_id,
      comment,
      created_at,
      profiles (
        id,
        full_name,
        username
      )
    `)
    .single();

  if (error) {
    throw error;
  }

  return mapComment(data);
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