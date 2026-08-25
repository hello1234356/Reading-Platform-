import { requireSupabase } from "./supabase";

const OBSERVE_SEARCH_BATCH_SIZE = 5;

function identityFor(book) {
  const source = String(book?.source || "").trim();
  let externalId = String(
    book?.externalId || book?.external_id ||
    (source === "google_books" ? book?.googleBooksId : "") ||
    (source === "open_library" ? book?.openLibraryKey || book?.editionKey : "") ||
    (source === "isbn_work" ? book?.isbn : ""),
  ).trim();
  const bookId = Number(book?.bookId || "");
  if (source === "community" && !externalId && Number.isSafeInteger(bookId) && bookId > 0) {
    externalId = `book:${bookId}`;
  }
  return { source, externalId, bookId: Number.isSafeInteger(bookId) && bookId > 0 ? bookId : undefined };
}

export function toModerationBook(book) {
  const identity = identityFor(book);
  if (!identity.source || !identity.externalId || !book?.title) return null;
  return {
    ...identity,
    title: String(book.title),
    authors: Array.isArray(book.authors)
      ? book.authors : String(book.author || "").split(",").map((value) => value.trim()).filter(Boolean),
    description: String(book.description || ""),
    categories: Array.isArray(book.categories) ? book.categories : book.genre ? [String(book.genre)] : [],
    subjects: Array.isArray(book.subjects) ? book.subjects : [],
    publisher: String(book.publisher || ""),
    publicationYear: Number(book.publicationYear || book.firstPublished) || undefined,
    isbn: String(book.isbn || ""),
    maturityRating: String(book.maturityRating || ""),
    language: String(book.language || ""),
    coverUrl: String(book.coverUrl || ""),
    providerMetadata: book.providerMetadata && typeof book.providerMetadata === "object"
      ? book.providerMetadata : {},
  };
}

export async function assessBooksInObserveMode(books) {
  const normalized = books.map(toModerationBook).filter(Boolean).slice(0, OBSERVE_SEARCH_BATCH_SIZE);
  if (!normalized.length) return { mode: "observe", results: [] };
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { mode: "observe", results: [] };
  const { data, error } = await supabase.functions.invoke("moderate-books", {
    body: { books: normalized },
  });
  if (error) throw error;
  return data;
}
