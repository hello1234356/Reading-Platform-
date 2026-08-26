import { persistMissingBookMetadataSafely } from "./bookMetadataApi.js";
import {
  buildGoogleBooksSearchUrl,
  detectSearchLanguage,
} from "./googleBooksSearchConfig.js";
export { buildGoogleBooksSearchUrl, detectSearchLanguage } from "./googleBooksSearchConfig.js";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export const BLOCKED_BOOK_CATEGORY_MESSAGE =
  "This book category is currently unavailable. Stay tuned for future updates.";

export function isBlockedGoogleBooksCategoryText(text) {
  return false;
}

export function isBlockedGoogleBooksResult(result) {
  return false;
}

export function filterGoogleBooksResults(results = []) {
  const allowedResults = [];
  let blockedCount = 0;

  results.forEach((result) => {
    if (isBlockedGoogleBooksResult(result)) blockedCount += 1;
    else allowedResults.push(result);
  });

  return { allowedResults, blockedCount };
}

function getApiKey() {
  return import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY?.trim() || "";
}

export function isGoogleBooksApiKeyConfigured() {
  return Boolean(getApiKey());
}

function withApiKey(url, configuredKey = getApiKey()) {
  const key = String(configuredKey || "").trim();
  if (key) url.searchParams.set("key", key);
  return url;
}

async function throwGoogleBooksError(response) {
  let apiMessage = "";
  let body = null;

  try {
    body = await response.json();
    apiMessage = body?.error?.message || "";
  } catch {
    // The status code still gives us enough information for a useful error.
  }

  const reasons = (body?.error?.errors || [])
    .map((error) => error?.reason)
    .filter(Boolean);
  const googleStatus = body?.error?.status || "";
  const hasQuotaDetails = (body?.error?.details || []).some((detail) =>
    String(detail?.["@type"] || "").includes("QuotaFailure"),
  );
  const quotaReasons = new Set([
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "dailyLimitExceeded",
    "quotaExceeded",
  ]);
  const isQuotaExceeded = response.status === 429 ||
    googleStatus === "RESOURCE_EXHAUSTED" ||
    hasQuotaDetails ||
    (response.status === 403 && reasons.some((reason) => quotaReasons.has(reason)));
  let error;

  if (isQuotaExceeded) {
    error = new Error(
      "Google Books search quota is unavailable. Add a Google Books API key to VITE_GOOGLE_BOOKS_API_KEY or check that key's quota.",
    );
  } else if (response.status === 400 || response.status === 403) {
    error = new Error(
      apiMessage || "Google Books rejected the API key. Check its API and website restrictions.",
    );
  } else {
    error = new Error(apiMessage || "Google Books could not complete the request.");
  }

  error.status = response.status;
  error.body = body;
  error.googleStatus = googleStatus;
  error.reasons = reasons;
  error.isQuotaExceeded = isQuotaExceeded;
  if (!isQuotaExceeded && (response.status === 401 || response.status === 403)) {
    error.code = "google_auth_failed";
    error.shouldFallback = true;
  }
  throw error;
}

export function isGoogleBooksQuotaError(error) {
  return Boolean(error?.isQuotaExceeded);
}

export function shouldFallbackFromGoogleBooks(error) {
  return Boolean(error?.shouldFallback) || isGoogleBooksQuotaError(error) ||
    Number(error?.status) >= 500;
}

function secureImageUrl(url = "") {
  return url.replace(/^http:/, "https:");
}

const LOOKUP_CACHE_TTL_MS = 30 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 30 * 1000;
const bookLookupCache = new Map();

function getCachedPromise(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.promise;
}

function getGoogleBookLookupKeys(book) {
  const keys = [];

  if (book?.googleBooksId) {
    keys.push(`volume:${book.googleBooksId}`);
  }

  const isbn = normalizeIsbn(book?.isbn);
  if (isbn) keys.push(`isbn:${isbn}`);

  return keys;
}

function cacheGoogleBookResult(result, promise = Promise.resolve(result)) {
  const keys = getGoogleBookLookupKeys({
    googleBooksId: result?.id,
    isbn: (result?.volumeInfo?.industryIdentifiers || []).find(
      ({ type }) => type === "ISBN_13",
    )?.identifier || (result?.volumeInfo?.industryIdentifiers || []).find(
      ({ type }) => type === "ISBN_10",
    )?.identifier,
  });
  const entry = {
    promise,
    expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS,
  };

  keys.forEach((key) => bookLookupCache.set(key, entry));
}

function normalizeDescription(description = "") {
  const value = String(description).trim();
  if (!value) return "";

  const withParagraphBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n");

  if (typeof DOMParser === "undefined") {
    return withParagraphBreaks
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }

  const document = new DOMParser().parseFromString(withParagraphBreaks, "text/html");
  return (document.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getGoogleBooksCoverUrl(isbn, zoom = 2) {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!normalizedIsbn) return "";
  return `https://books.google.com/books/content?id=ISBN${encodeURIComponent(normalizedIsbn)}&printsec=frontcover&img=1&zoom=${zoom}&source=gbs_api`;
}

export function getPreferredGoogleBooksCoverUrl(coverUrl) {
  const storedCoverUrl = String(coverUrl || "").trim();

  return storedCoverUrl
    ? secureImageUrl(storedCoverUrl)
    : "";
}


export function mapGoogleBooksResult(result) {
  const info = result?.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const isbn =
    identifiers.find(({ type }) => type === "ISBN_13")?.identifier ||
    identifiers.find(({ type }) => type === "ISBN_10")?.identifier ||
    "";

  return {
    googleBooksId: result?.id || "",
    isbn: normalizeIsbn(isbn),
    title: info.title || "Untitled",
    author: info.authors?.join(", ") || "Unknown author",
    firstPublished: info.publishedDate?.slice(0, 4) || null,
    coverUrl: secureImageUrl(
      info.imageLinks?.thumbnail ||
      info.imageLinks?.smallThumbnail ||
      "",
    ),
    description: normalizeDescription(info.description),
    publisher: info.publisher || "",
    genre: info.categories?.[0] || "",
    categories: Array.isArray(info.categories) ? info.categories : [],
    subjects: [],
    maturityRating: info.maturityRating || "",
    language: info.language || "",
    providerMetadata: {
      publishedDate: info.publishedDate || "",
      pageCount: info.pageCount || null,
      printType: info.printType || "",
    },
  };
}

function getGoogleBooksSearchQueries(searchTerm) {
  const query = String(searchTerm || "").trim();
  if (!query || /^isbn:/i.test(query)) return [query];

  const queries = [query];
  const words = query.split(/\s+/).filter(Boolean);
  const looksLikePlainTitle =
    query.length >= 3 &&
    query.length <= 90 &&
    !/[:"()]/.test(query) &&
    !/\b(?:inauthor|intitle|inpublisher|subject|isbn):/i.test(query);

  if (looksLikePlainTitle) {
    queries.push(`intitle:"${query}"`);

    if (words.length >= 4) {
      const preferredSplit = Math.min(4, words.length - 1);
      const splitPoints = Array.from(
        new Set([preferredSplit, 3, 2]),
      ).filter((splitPoint) => splitPoint > 0 && splitPoint < words.length);

      splitPoints.forEach((splitPoint) => {
        const possibleTitle = words.slice(0, splitPoint).join(" ");
        const possibleAuthor = words.slice(splitPoint).join(" ");

        queries.push(`intitle:"${possibleTitle}" inauthor:"${possibleAuthor}"`);
        queries.push(`intitle:"${possibleTitle}"`);
      });
    }
  }

  return Array.from(new Set(queries)).slice(0, 8);
}

function normalizeSearchMatchText(value = "") {
  return String(value)
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasStrongGoogleBooksMatch(results = [], searchTerm = "") {
  const query = normalizeSearchMatchText(searchTerm);
  if (!query) return true;

  return results.some((result) => {
    const info = result?.volumeInfo || {};
    const title = normalizeSearchMatchText(info.title);
    const authors = normalizeSearchMatchText((info.authors || []).join(" "));
    const combined = normalizeSearchMatchText(
      `${info.title || ""} ${authors}`,
    );

    return (
      title === query ||
      (
        query.includes(title) &&
        title.length >= 8 &&
        combined.includes(query.slice(title.length).trim())
      ) ||
      combined.includes(query)
    );
  });
}

export async function searchGoogleBooks(searchTerm, maxResults = 20, options = {}) {
  const apiKey = options.apiKey ?? getApiKey();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const debug = options.debug ?? Boolean(import.meta.env?.DEV);

  if (debug) console.debug("[book-search] google configuration", {
    googleBooksApiKeyConfigured: Boolean(apiKey),
  });

  if (!apiKey) {
    const error = new Error(
      "Google Books search needs an API key. Add VITE_GOOGLE_BOOKS_API_KEY to frontend/.env.local, then restart the app.",
    );
    error.code = "google_api_key_missing";
    error.shouldFallback = true;
    error.actualProviderFetchPerformed = false;
    if (debug) console.debug("[book-search] google skipped: missing_api_key", {
      googleBooksApiKeyConfigured: false,
    });
    throw error;
  }

  const normalizedSearchTerm = String(searchTerm || "").trim();
  const request = (async () => {
    const resultsById = new Map();
    const queries = getGoogleBooksSearchQueries(normalizedSearchTerm);
    const searchLanguage = detectSearchLanguage(normalizedSearchTerm);

    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index];
      const url = buildGoogleBooksSearchUrl(query, maxResults, apiKey);
      if (!searchLanguage) url.searchParams.delete("langRestrict");

      let response;
      try {
        response = await fetchImpl(url);
      } catch (cause) {
        const error = new Error("Google Books could not be reached.");
        error.code = "google_network_error";
        error.shouldFallback = true;
        error.actualProviderFetchPerformed = true;
        error.cause = cause;
        if (debug) console.debug("[book-search] GOOGLE FAILED", {
          status: null,
          code: error.code,
          fallbackEligible: true,
        });
        throw error;
      }

      if (!response.ok) {
        try {
          await throwGoogleBooksError(response);
        } catch (error) {
          if (debug) console.debug("[book-search] GOOGLE FAILED", {
            status: error.status || response.status,
            code: error.googleStatus || error.code || "google_http_error",
            fallbackEligible: shouldFallbackFromGoogleBooks(error),
          });
          throw error;
        }
      }

      let data;
      try {
        data = await response.json();
      } catch (cause) {
        const error = new Error("Google Books returned an invalid response.");
        error.code = "google_invalid_response";
        error.shouldFallback = true;
        error.actualProviderFetchPerformed = true;
        error.cause = cause;
        throw error;
      }

      if (!data || typeof data !== "object" ||
        (data.items != null && !Array.isArray(data.items))) {
        const error = new Error("Google Books returned an invalid response.");
        error.code = "google_invalid_response";
        error.shouldFallback = true;
        error.actualProviderFetchPerformed = true;
        throw error;
      }

      (data.items || []).forEach((result) => {
        if (!result?.id || resultsById.has(result.id)) return;
        resultsById.set(result.id, result);
        cacheGoogleBookResult(result);
      });

      const hasRunBroadAndExactTitle = index >= 1;

    if (
      hasRunBroadAndExactTitle &&
      hasStrongGoogleBooksMatch(
        Array.from(resultsById.values()),
        normalizedSearchTerm,
      )
    ) {
      break;
      }
    }

    const results = Array.from(resultsById.values());
    if (debug) console.debug("[book-search] GOOGLE ACTUAL RESPONSE", {
      itemCount: results.length,
      titles: results.slice(0, 10).map((result) => ({
        title: result?.volumeInfo?.title || "",
        author: result?.volumeInfo?.authors?.join(", ") || "",
      })),
    });
    return results;
  })();
  return request;
}

async function fetchGoogleBook(book) {
  const lookupKeys = getGoogleBookLookupKeys(book);

  for (const lookupKey of lookupKeys) {
    const cachedLookup = getCachedPromise(bookLookupCache, lookupKey);
    if (cachedLookup) return cachedLookup;
  }

  const lookup = fetchGoogleBookWithoutCache(book);
  const cacheEntry = {
    promise: lookup,
    expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS,
  };

  lookupKeys.forEach((key) => bookLookupCache.set(key, cacheEntry));
  void lookup.then(
    (result) => {
      if (result) cacheGoogleBookResult(result, lookup);
    },
    () => {
      cacheEntry.expiresAt = Date.now() + FAILURE_CACHE_TTL_MS;
    },
  );

  if (lookupKeys.length === 0) {
    return lookup;
  }

  return lookup;
}

async function fetchGoogleBookWithoutCache(book) {
  if (book?.googleBooksId) {
    const url = withApiKey(new URL(
      `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(book.googleBooksId)}`,
    ));
    const response = await fetch(url);
    if (!response.ok) await throwGoogleBooksError(response);
    return response.json();
  }

  if (book?.isbn) {
    const results = await searchGoogleBooks(`isbn:${normalizeIsbn(book.isbn)}`, 1);
    return results[0] || null;
  }

  return null;
}

export async function getGoogleBooksBookDetails(book) {
  const baseDetails = {
    title: book?.title || book?.book || "Untitled",
    author: book?.author || "Unknown author",
    isbn: book?.isbn || "",
    coverUrl: getPreferredGoogleBooksCoverUrl(
      book?.coverUrl,
      book?.isbn,
    ),
    description: book?.description || "",
    googleBooksId: book?.googleBooksId || "",
  };

  // Stored descriptions and search-result metadata are authoritative enough
  // for display. Only consult Google when a user opens an incomplete record.
  if (String(baseDetails.description).trim()) {
    return baseDetails;
  }

  try {
    const result = await fetchGoogleBook(book);
    if (!result) return baseDetails;
    const details = mapGoogleBooksResult(result);
    const resolvedDetails = {
      ...baseDetails,
      title: details.title || baseDetails.title,
      author: details.author || baseDetails.author,
      isbn: details.isbn || baseDetails.isbn,
      googleBooksId: details.googleBooksId || baseDetails.googleBooksId,
      coverUrl: details.coverUrl || baseDetails.coverUrl,
      description: details.description || baseDetails.description ||
        "Google Books does not have an official description for this edition yet.",
      publisher: details.publisher || book?.publisher || "",
      genre: details.genre || book?.genre || "",
      firstPublished: details.firstPublished || book?.firstPublished || null,
    };
    await persistMissingBookMetadataSafely(book, {
      ...resolvedDetails,
      description: details.description,
    });
    return resolvedDetails;
  } catch (error) {
    return {
      ...baseDetails,
      error: error.message || "Google Books could not load this book.",
      description: baseDetails.description ||
        "Google Books does not have an official description for this edition yet.",
    };
  }
}

export async function enrichBooksWithGoogleBooks(books = []) {
  return Promise.all(
    books.map(async (book) => {
      if (book?.skipGoogleBooksEnrichment) return book;
      if (book?.source && book.source !== "google_books") return book;
      if (!book?.isbn && !book?.googleBooksId) return book;

      const details = await getGoogleBooksBookDetails(book);
      return {
        ...book,
        googleBooksId: details.googleBooksId || book.googleBooksId || "",
        title: details.title || book.title,
        author: details.author || book.author,
        coverUrl: details.coverUrl || book.coverUrl || "",
        description: details.description || book.description || "",
      };
    }),
  );
}
