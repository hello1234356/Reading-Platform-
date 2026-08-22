import { requireSupabase } from "./supabase";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function cleanText(value) {
  return String(value || "").trim();
}

export async function submitBookSubmission(bookData) {
  const supabase = requireSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  const userId = userData?.user?.id;

  if (!userId) {
    throw new Error("You must be logged in to submit a book.");
  }

  const normalizedIsbn = normalizeIsbn(bookData.isbn);
  const publicationYear = bookData.publicationYear
    ? Number(bookData.publicationYear)
    : null;

  const { data, error } = await supabase
    .from("book_submissions")
    .insert({
      submitted_by: userId,
      title: cleanText(bookData.title),
      author: cleanText(bookData.author),
      language: cleanText(bookData.language),
      isbn: normalizedIsbn || null,
      publisher: cleanText(bookData.publisher) || null,
      publication_year: publicationYear,
      description: cleanText(bookData.description) || null,
      cover_url: cleanText(bookData.coverUrl) || null,
      status: "pending",
    })
    .select(`
      id,
      submitted_by,
      title,
      author,
      language,
      isbn,
      publisher,
      publication_year,
      description,
      cover_url,
      status,
      created_at,
      updated_at
    `)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
