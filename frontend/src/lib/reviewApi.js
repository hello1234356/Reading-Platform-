import { requireSupabase } from "./supabase";

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
    coverUrl: row.books?.cover_url || "",
  };
}

export async function getRecentFinishedBooks(limit = 10) {
  const supabase = requireSupabase();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 10));

  const { data, error } = await supabase
    .from("reviews")
    .select(`
      id,
      book_id,
      rating,
      updated_at,
      books (
        id,
        title,
        author,
        isbn,
        cover_url
      )
    `)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    bookId: row.book_id,
    title: row.books?.title || "Untitled",
    author: row.books?.author || "Unknown author",
    isbn: row.books?.isbn || "",
    coverUrl: row.books?.cover_url || "",
    rating: Number(row.rating),
  }));
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

  return (data || []).map(mapReview);
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

  if (
    Number.isNaN(numericRating) ||
    numericRating < 0.5 ||
    numericRating > 5
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
        rating: numericRating,
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

  return mapReview(data);
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
