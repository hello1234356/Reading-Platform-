import { requireSupabase } from "./supabase";
import { DEFAULT_EXHIBITION_SLUG } from "../config/exhibitions";

function cleanOptional(value, maxLength) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export async function submitExhibitionBookRecommendation({
  submitterName = "",
  submitterGrade = "",
  bookTitle,
  selectedBook = null,
  recommendation,
  exhibitionSlug = DEFAULT_EXHIBITION_SLUG,
}) {
  const supabase = requireSupabase();
  const trimmedTitle = String(bookTitle || "").trim();
  const trimmedRecommendation = String(recommendation || "").trim();

  if (!trimmedTitle) {
    throw new Error("Please enter the book title.");
  }

  if (!trimmedRecommendation) {
    throw new Error("Please tell the library why you recommend this book.");
  }

  const { data: userResult } = await supabase.auth.getUser();
  const userId = userResult?.user?.id || null;

  const { error } = await supabase
    .from("exhibition_book_recommendations")
    .insert({
      exhibition_slug: exhibitionSlug,
      submitter_user_id: userId,
      submitter_name: cleanOptional(submitterName, 80),
      submitter_grade: cleanOptional(submitterGrade, 40),
      book_title: trimmedTitle.slice(0, 240),
      book_author: cleanOptional(selectedBook?.author, 240),
      book_cover_url: cleanOptional(selectedBook?.coverUrl, 1000),
      book_id: selectedBook?.bookId || null,
      recommendation: trimmedRecommendation.slice(0, 1200),
    });

  if (error) throw error;

  return { bookTitle: trimmedTitle };
}
