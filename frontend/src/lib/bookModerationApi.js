import { requireSupabase } from "./supabase.js";

export const MODERATION_BATCH_SIZE = 5;
export const MAX_CONCURRENT_MODERATION_BATCHES = 2;
const MODERATION_CACHE_BATCH_SIZE = 10;

const now = () => globalThis.performance?.now?.() ?? Date.now();
const debugTiming = (label, details) => {
  if (import.meta.env?.DEV) console.debug(`[book-search] ${label}`, details);
};

function canonicalOpenLibraryId(value) {
  const raw = String(value || "").trim();
  if (/^\/(?:works|books)\/[A-Za-z0-9_-]+[WM]$/u.test(raw)) return raw;
  if (/^[A-Za-z0-9_-]+M$/u.test(raw)) return `/books/${raw}`;
  if (/^[A-Za-z0-9_-]+W$/u.test(raw)) return `/works/${raw}`;
  return "";
}

export function moderationIdentityForBook(book) {
  const source = String(book?.source || "").trim().toLowerCase();
  let externalId = String(book?.externalId || book?.external_id
    || (source === "google_books" ? book?.googleBooksId : "")
    || (source === "open_library" ? book?.openLibraryKey || book?.editionKey : "")
    || (source === "isbn_work" ? book?.isbn : "")).trim();
  const bookId = Number(book?.bookId || "");
  if (source === "open_library") externalId = canonicalOpenLibraryId(externalId);
  if (source === "isbn_work") {
    externalId = externalId.replace(/[^0-9Xx]/g, "").toUpperCase();
  }
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
    language: String(book.language || ""), coverUrl: String(book.coverUrl || "") };
}

function evidenceRichness(book) {
  return String(book.description || "").length + (book.authors?.length || 0) * 200 +
    (book.categories?.length || 0) * 80 + (book.subjects?.length || 0) * 40 +
    [book.publisher, book.publicationYear, book.isbn, book.language]
      .filter(Boolean).length * 100;
}

export function uniqueModerationBooks(books) {
  const unique = new Map();
  books.forEach((book) => {
    const normalized = toModerationBook(book);
    if (!normalized) return;
    const key = `${normalized.source}\u0000${normalized.externalId}`;
    const previous = unique.get(key);
    if (!previous || evidenceRichness(normalized) > evidenceRichness(previous)) {
      unique.set(key, normalized);
    }
  });
  return [...unique.values()];
}

export function initializeBookModerationResults(books) {
  return books.map((book, index) => ({ ...book, moderationStatus: "checking",
    moderationKey: moderationIdentityForBook(book).key || `invalid:${index}` }));
}

export async function invokeModerationBatches(books, cacheOnly, onBatch, invokeBatch) {
  const batches = [];
  const batchSize = cacheOnly ? MODERATION_CACHE_BATCH_SIZE : MODERATION_BATCH_SIZE;
  for (let index = 0; index < books.length; index += batchSize) {
    batches.push(books.slice(index, index + batchSize));
  }
  if (!batches.length) return;

  const supabase = invokeBatch ? null : requireSupabase();
  const callBatch = invokeBatch || ((batch) => supabase.functions.invoke("moderate-books", {
    body: { books: batch, cacheOnly },
  }));
  let nextBatchIndex = 0;

  async function worker() {
    while (nextBatchIndex < batches.length) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const batch = batches[batchIndex];
      const batchId = `${cacheOnly ? "cache" : "ai"}-${batchIndex + 1}`;
      const batchStartedAt = now();
      let data = null;
      let error = null;
      debugTiming(`${batchId} started`, { batchId, count: batch.length });
      try {
        const response = await callBatch(batch, { cacheOnly, batchId, batchIndex });
        data = response?.data;
        error = response?.error || null;
        if (error) throw error;
        onBatch(Array.isArray(data?.results) ? data.results : [], data || {}, {
          requestedBooks: batch, batchId, batchIndex,
        });
      } catch (caught) {
        error = caught;
        onBatch([], data || {}, { requestedBooks: batch, batchId, batchIndex, error });
      } finally {
        debugTiming(`${batchId} finished`, { batchId, count: batch.length,
          durationMs: now() - batchStartedAt, failed: Boolean(error) });
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENT_MODERATION_BATCHES, batches.length) },
    () => worker(),
  ));
}

async function invokeBatches(books, cacheOnly, onBatch) {
  return invokeModerationBatches(books, cacheOnly, onBatch);
}

export function shouldApplyModerationTransition(previousStatus, nextStatus) {
  return !(String(previousStatus || "").toLowerCase() === "approved" &&
    String(nextStatus || "").toLowerCase() !== "approved");
}

export function applyBookModerationUpdate(book, key, moderationStatus, details = {}) {
  if (book.moderationKey !== key ||
    !shouldApplyModerationTransition(book.moderationStatus, moderationStatus)) {
    return book;
  }
  const next = { ...book, moderationStatus,
    moderationFailureCode: moderationStatus === "approved" ? "" : details.failureCode || "",
    moderationPolicyVersion: details.policyVersion || book.moderationPolicyVersion || "" };
  debugTiming("moderation transition", { moderationKey: key,
    previousStatus: book.moderationStatus || "checking", newStatus: moderationStatus,
    failureCode: next.moderationFailureCode, batchId: details.batchId || "" });
  return next;
}

export async function moderateBookSearchResults(
  books,
  onUpdate,
  providerDurationMs = 0,
  invoke = invokeBatches,
) {
  const startedAt = now();
  debugTiming("provider results rendered", { durationMs: providerDurationMs,
    resultCount: books.length });
  const unique = uniqueModerationBooks(books);
  books.filter((book) => !toModerationBook(book)).forEach((book) => onUpdate(
    book.moderationKey, "failed", { failureCode: "invalid_identity" },
  ));
  const unknown = new Map(unique.map((book) => [
    `${book.source}\u0000${book.externalId}`, book,
  ]));
  let cachedCount = 0;
  const cacheStartedAt = now();

  try {
    await invoke(unique, true, (results, _data, context = {}) => {
      if (context.error) {
        debugTiming("cache batch lookup failed", {
          failureCode: "cache_request_failed", count: context.requestedBooks?.length || 0,
          error: context.error,
        });
        return;
      }
      results.forEach((result) => {
        const key = `${result.source}\u0000${result.externalId}`;
        if (result.cached && unknown.has(key)) {
          cachedCount += 1;
          unknown.delete(key);
          onUpdate(key, result.status === "error" ? "failed" : result.status, {
            ...result, batchId: context.batchId,
          });
        }
      });
    });
  } catch (error) {
    debugTiming("cache lookup failed", { failureCode: "cache_request_failed", error });
  }

  const cacheDurationMs = now() - cacheStartedAt;
  const requiringAi = [...unknown.values()];
  debugTiming("cache", { providerDurationMs, cacheDurationMs, cachedCount,
    requiringAi: requiringAi.length, firstResultsRenderedMs: providerDurationMs });
  debugTiming("cache decisions applied", { durationMs: cacheDurationMs, cachedCount });
  if (!requiringAi.length) {
    debugTiming("all moderation completed", { durationMs: now() - startedAt,
      requiringAi: 0 });
    return;
  }

  const aiStartedAt = now();
  const unresolved = new Map(requiringAi.map((book) => [
    `${book.source}\u0000${book.externalId}`, book,
  ]));
  let firstApprovedLogged = false;
  try {
    await invoke(requiringAi, false, (results, _data, context = {}) => {
      const requestedKeys = new Set((context.requestedBooks || []).map((book) =>
        `${book.source}\u0000${book.externalId}`));
      if (context.error) {
        requestedKeys.forEach((key) => {
          if (!unresolved.has(key)) return;
          unresolved.delete(key);
          onUpdate(key, "failed", { failureCode: "edge_request_failed",
            batchId: context.batchId });
        });
        debugTiming("AI batch failed", { failureCode: "edge_request_failed",
          count: requestedKeys.size, error: context.error });
        return;
      }
      const returnedKeys = new Set();
      results.forEach((result) => {
        const key = `${result.source}\u0000${result.externalId}`;
        if (!unresolved.has(key)) return;
        returnedKeys.add(key);
        unresolved.delete(key);
        if (result.status === "error") {
          debugTiming("moderation result failed", { source: result.source,
            externalId: result.externalId, failureCode: result.failureCode || "moderation_error" });
        }
        const nextStatus = result.status === "error" ? "failed" : result.status;
        if (nextStatus === "approved" && !firstApprovedLogged) {
          firstApprovedLogged = true;
          debugTiming("first approved result available", {
            durationMs: now() - startedAt, batchId: context.batchId,
          });
        }
        onUpdate(key, nextStatus, { ...result, batchId: context.batchId });
      });
      requestedKeys.forEach((key) => {
        if (!unresolved.has(key) || returnedKeys.has(key)) return;
        unresolved.delete(key);
        onUpdate(key, "failed", { failureCode: "moderation_response_incomplete",
          batchId: context.batchId });
      });
    });
  } catch (error) {
    unresolved.forEach((_book, key) => onUpdate(
      key, "failed", { failureCode: "edge_request_failed" },
    ));
    unresolved.clear();
    debugTiming("AI batch failed", { failureCode: "edge_request_failed", error });
  } finally {
    unresolved.forEach((_book, key) => onUpdate(
      key, "failed", { failureCode: "moderation_response_incomplete" },
    ));
    unresolved.clear();
    debugTiming("AI", { aiBatchDurationMs: now() - aiStartedAt,
      totalBackgroundDurationMs: now() - startedAt, requiringAi: requiringAi.length });
    debugTiming("all moderation completed", { durationMs: now() - startedAt,
      requiringAi: requiringAi.length });
  }
}
