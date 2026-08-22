import { requireSupabase } from "./supabase";
import {
  enrichBooksWithGoogleBooks,
  getPreferredGoogleBooksCoverUrl,
} from "./googleBooks";

function mapReview(row) {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    rating: Number(row.rating),
    note: row.review_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    book: row.books?.title || "Untitled",
    author: row.books?.author || "Unknown author",
    isbn: row.books?.isbn || "",
    coverUrl: getPreferredGoogleBooksCoverUrl(
      row.books?.cover_url,
      row.books?.isbn,
    ),
  };
}

function mapFinishedBook(row) {
  const source = row.source || "";

  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title || row.books?.title || "Untitled",
    author: row.author || row.books?.author || "Unknown author",
    isbn: row.isbn || row.books?.isbn || "",
    source,
    externalId: row.external_id || "",
    coverUrl:
      source === "google_books"
        ? getPreferredGoogleBooksCoverUrl(row.cover_url, row.isbn)
        : row.cover_url || row.books?.cover_url || "",
    rating: row.rating == null ? null : Number(row.rating),
    progress: Number(row.progress ?? 100),
    skipGoogleBooksEnrichment: Boolean(source && source !== "google_books"),
  };
}

function isMissingRecentFinishesRpc(error) {
  return error?.code === "PGRST202" ||
    String(error?.message || "").includes("get_recent_finished_books");
}

async function getRecentFinishedBooksFallback(supabase, safeLimit) {
  const { data, error } = await supabase
    .from("shelves")
    .select(`
      id,
      book_id,
      rating,
      progress,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        cover_url,
        source,
        external_id
      )
    `)
    .eq("shelf", "read")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw error;
  }

  return (data || [])
    .filter((row) => row.books)
    .map((row) => mapFinishedBook({
      ...row,
      title: row.books?.title,
      author: row.books?.author,
      isbn: row.books?.isbn,
      cover_url: row.books?.cover_url,
      source: row.books?.source,
      external_id: row.books?.external_id,
    }));
}

export async function getRecentFinishedBooks(limit = 10) {
  const supabase = requireSupabase();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 10));

  const { data, error } = await supabase.rpc("get_recent_finished_books", {
    p_limit: safeLimit,
  });

  if (error && !isMissingRecentFinishesRpc(error)) {
    throw error;
  }

  const books = error
    ? await getRecentFinishedBooksFallback(supabase, safeLimit)
    : (data || []).map(mapFinishedBook);

  return enrichBooksWithGoogleBooks(books);
}

export async function getUserReviews(userId) {
  if (!userId) {
    return [];
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("reviews")
    .select(`
      id,
      user_id,
      book_id,
      rating,
      review_text,
      created_at,
      updated_at,
      books (
        id,
        title,
        author,
        isbn,
        cover_url
      )
    `)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const reviews = (data || []).map(mapReview);
  return enrichBooksWithGoogleBooks(reviews);
}

export async function saveReview({
  userId,
  bookId,
  rating,
  reviewText,
}) {
  if (!userId) {
    throw new Error("You must be logged in to save a review.");
  }

  if (!bookId) {
    throw new Error("This review is missing its book ID.");
  }

  const numericRating = Number(rating);
  const normalizedRating = Math.round(numericRating * 2) / 2;

  if (
    Number.isNaN(numericRating) ||
    normalizedRating < 0.5 ||
    normalizedRating > 5
  ) {
    throw new Error("Rating must be between 0.5 and 5.");
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("reviews")
    .upsert(
      {
        user_id: userId,
        book_id: bookId,
        rating: normalizedRating,
        review_text: reviewText?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,book_id",
      },
    )
    .select(`
      id,
      user_id,
      book_id,
      rating,
      review_text,
      created_at,
      updated_at,
      books (
        id,
        title,
        author,
        isbn,
        cover_url
      )
    `)
    .single();

  if (error) {
    throw error;
  }

  const { error: shelfRatingError } = await supabase
    .from("shelves")
    .update({ rating: normalizedRating })
    .eq("user_id", userId)
    .eq("book_id", bookId);

  if (shelfRatingError) {
    throw shelfRatingError;
  }

  const [review] = await enrichBooksWithGoogleBooks([mapReview(data)]);
  return review;
}

export async function deleteReview(reviewId) {
  if (!reviewId) {
    throw new Error("This review is missing its ID.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId);

  if (error) {
    throw error;
  }
}
