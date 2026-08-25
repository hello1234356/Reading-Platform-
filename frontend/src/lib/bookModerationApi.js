import { requireSupabase } from "./supabase.js";

const MODERATION_BATCH_SIZE = 10;

export function moderationIdentityForBook(book) {
  const source = String(book?.source || "").trim();
  let externalId = String(book?.externalId || book?.external_id
    || (source === "google_books" ? book?.googleBooksId : "")
    || (source === "open_library" ? book?.openLibraryKey || book?.editionKey : "")
    || (source === "isbn_work" ? book?.isbn : "")).trim();
  const bookId = Number(book?.bookId || "");
  if (source === "community" && !externalId && Number.isSafeInteger(bookId) && bookId > 0) {
    externalId = `book:${bookId}`;
  }
  return { source, externalId,
    key: source && externalId ? `${source}\u0000${externalId}` : "",
    bookId: Number.isSafeInteger(bookId) && bookId > 0 ? bookId : undefined };
}

export function toModerationBook(book) {
  const identity = moderationIdentityForBook(book);
  if (!identity.key || !book?.title) return null;
  return { source: identity.source, externalId: identity.externalId, bookId: identity.bookId,
    title: String(book.title),
    authors: Array.isArray(book.authors) ? book.authors
      : String(book.author || "").split(",").map((value) => value.trim()).filter(Boolean),
    description: String(book.description || ""),
    categories: Array.isArray(book.categories) ? book.categories
      : book.genre ? [String(book.genre)] : [],
    subjects: Array.isArray(book.subjects) ? book.subjects : [],
    publisher: String(book.publisher || ""),
    publicationYear: Number(book.publicationYear || book.firstPublished) || undefined,
    isbn: String(book.isbn || ""), maturityRating: String(book.maturityRating || ""),
    language: String(book.language || ""), coverUrl: String(book.coverUrl || ""),
    providerMetadata: book.providerMetadata && typeof book.providerMetadata === "object"
      ? book.providerMetadata : {} };
}

export function uniqueModerationBooks(books) {
  const unique = new Map();
  books.forEach((book) => {
    const normalized = toModerationBook(book);
    if (normalized) unique.set(`${normalized.source}\u0000${normalized.externalId}`, normalized);
  });
  return [...unique.values()];
}

export function initializeBookModerationResults(books) {
  return books.map((book) => ({ ...book, moderationStatus: "checking",
    moderationKey: moderationIdentityForBook(book).key }));
}

async function invokeBatches(books, cacheOnly, onBatch) {
  const supabase = requireSupabase();
  for (let index = 0; index < books.length; index += MODERATION_BATCH_SIZE) {
    const batch = books.slice(index, index + MODERATION_BATCH_SIZE);
    const { data, error } = await supabase.functions.invoke("moderate-books", {
      body: { books: batch, cacheOnly },
    });
    if (error) throw error;
    onBatch(Array.isArray(data?.results) ? data.results : [], data || {});
  }
}

const now = () => globalThis.performance?.now?.() ?? Date.now();
const debugTiming = (label, details) => {
  if (import.meta.env?.DEV) console.debug(`[book-search] ${label}`, details);
};

export async function moderateBookSearchResults(
  books,
  onUpdate,
  providerDurationMs = 0,
  invoke = invokeBatches,
) {
  const startedAt = now();
  const unique = uniqueModerationBooks(books);
  const unknown = new Map(unique.map((book) => [
    `${book.source}\u0000${book.externalId}`, book,
  ]));
  let cachedCount = 0;
  const cacheStartedAt = now();

  try {
    await invoke(unique, true, (results) => {
      results.forEach((result) => {
        const key = `${result.source}\u0000${result.externalId}`;
        if (result.cached) {
          cachedCount += 1;
          unknown.delete(key);
          onUpdate(key, result.status, result);
        }
      });
    });
  } catch (error) {
    unique.forEach((book) => onUpdate(`${book.source}\u0000${book.externalId}`, "failed"));
    debugTiming("cache lookup failed", { error });
    return;
  }

  const cacheDurationMs = now() - cacheStartedAt;
  const requiringAi = [...unknown.values()];
  debugTiming("cache", { providerDurationMs, cacheDurationMs, cachedCount,
    requiringAi: requiringAi.length, firstResultsRenderedMs: providerDurationMs });
  if (!requiringAi.length) return;

  const aiStartedAt = now();
  try {
    await invoke(requiringAi, false, (results) => {
      results.forEach((result) => onUpdate(
        `${result.source}\u0000${result.externalId}`,
        result.status === "error" ? "failed" : result.status,
        result,
      ));
    });
  } catch (error) {
    requiringAi.forEach((book) => onUpdate(
      `${book.source}\u0000${book.externalId}`, "failed",
    ));
    debugTiming("AI batch failed", { error });
  } finally {
    debugTiming("AI", { aiBatchDurationMs: now() - aiStartedAt,
      totalBackgroundDurationMs: now() - startedAt, requiringAi: requiringAi.length });
  }
}
