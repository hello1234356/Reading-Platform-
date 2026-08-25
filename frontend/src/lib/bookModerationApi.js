import { requireSupabase } from "./supabase";

const ENFORCE_SEARCH_BATCH_SIZE = 10;
export const BOOK_REVIEW_MESSAGE = "This book’s having a quick chat with our bookish gatekeepers 📚 Check back soon!";

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

export async function enforceBookSearchResults(books) {
  const candidates = books.map((book) => ({ book, moderation: toModerationBook(book) }))
    .filter((candidate) => candidate.moderation);
  if (!candidates.length) return { mode: "enforce", results: [], withheldCount: books.length,
    message: books.length ? BOOK_REVIEW_MESSAGE : "" };
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error("Sign in to search the moderated book catalog.");

  const assessments = [];
  for (let index = 0; index < candidates.length; index += ENFORCE_SEARCH_BATCH_SIZE) {
    const batch = candidates.slice(index, index + ENFORCE_SEARCH_BATCH_SIZE);
    const { data, error } = await supabase.functions.invoke("moderate-books", {
      body: { books: batch.map((candidate) => candidate.moderation) },
    });
    if (error) throw error;
    assessments.push(...(Array.isArray(data?.results) ? data.results : []));
  }

  const statusByIdentity = new Map(assessments.map((assessment) => [
    `${assessment.source}\u0000${assessment.externalId}`, assessment.status,
  ]));
  const approved = candidates.filter(({ moderation }) => (
    statusByIdentity.get(`${moderation.source}\u0000${moderation.externalId}`) === "approved"
  )).map(({ book }) => book);
  const withheldCount = books.length - approved.length;
  return { mode: "enforce", results: approved, withheldCount,
    message: withheldCount ? BOOK_REVIEW_MESSAGE : "" };
}
