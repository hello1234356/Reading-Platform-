import {
  mapGoogleBooksResult,
  isGoogleBooksApiKeyConfigured,
  searchGoogleBooks,
  shouldFallbackFromGoogleBooks,
} from "./googleBooks";
import { isLikelyIsbn } from "./isbnWorkBooks";
import { searchOpenLibraryBooks } from "./openLibraryBooks";
import {
  normalizeCommunityBookIsbn,
  searchCatalogBooks,
} from "./communityBooks";
import { searchWithSharedCache } from "./bookSearchCache";
import { searchCatalogAndExternal, searchGoogleWithQuotaFallback } from "./bookSearchPolicy";
import { initializeBookModerationResults, moderateBookSearchResults } from "./bookModerationApi";
import { rankBookSearchResults } from "./bookSearchRelevance";

export function isChineseBookSearch(searchTerm) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(
    String(searchTerm || ""),
  );
}

const debugSearch = (label, details) => {
  if (import.meta.env?.DEV) console.debug(`[book-search] ${label}`, details);
};

async function searchGoogleProvider(searchTerm, limit, options = {}) {
  debugSearch("google configuration", {
    googleBooksApiKeyConfigured: isGoogleBooksApiKeyConfigured(),
  });
  const response = await searchWithSharedCache({
    provider: "google_books",
    searchTerm,
    limit,
    fetchResults: async () => {
      const googleResults = await searchGoogleBooks(searchTerm, limit, {
        bypassProviderCache: options.bypassProviderCache,
      });
      return {
        results: googleResults.map((result) => ({
          ...mapGoogleBooksResult(result),
          source: "google_books",
        })),
        blockedCount: 0,
      };
    },
    bypassProviderCache: options.bypassProviderCache,
    onCacheDiagnostic: (details) => debugSearch("google cache", details),
  });
  return response;
}

async function searchOpenLibraryProvider(searchTerm, limit, options = {}) {
  const response = await searchWithSharedCache({
    provider: "open_library",
    searchTerm,
    limit,
    fetchResults: () => searchOpenLibraryBooks(searchTerm, limit),
    bypassProviderCache: options.bypassProviderCache,
    onCacheDiagnostic: (details) => debugSearch("open_library cache", details),
  });
  return response;
}

async function searchNonChineseExternalBooks(searchTerm, limit, options = {}) {
  return searchGoogleWithQuotaFallback({
    searchGoogle: () => searchGoogleProvider(searchTerm, limit, options),
    searchOpenLibrary: () => searchOpenLibraryProvider(searchTerm, limit, options),
    isQuotaError: shouldFallbackFromGoogleBooks,
    onFallback: (error) => debugSearch("FALLBACK TO OPEN LIBRARY", {
      code: error.code || error.googleStatus || "google_provider_unavailable",
    }),
  });
}

function getProviderKey(book) {
  if (book?.source === "google_books" && book.googleBooksId) {
    return `google_books:${book.googleBooksId}`;
  }

  if (book?.source === "open_library") {
    const externalId = book.openLibraryKey || book.editionKey || book.externalId || "";
    if (externalId) return `open_library:${externalId}`;
  }

  if (book?.source === "isbn_work" && book.isbn) {
    return `isbn_work:${normalizeCommunityBookIsbn(book.isbn)}`;
  }

  if (book?.source && book?.externalId) {
    return `${book.source}:${book.externalId}`;
  }

  return "";
}

export function mergeBookResults(preferredResults = [], additionalResults = []) {
  const mergedResults = [];
  const seenIsbns = new Set();
  const seenProviderKeys = new Set();

  preferredResults.concat(additionalResults).forEach((book) => {
    const isbn = normalizeCommunityBookIsbn(book.isbn);
    const providerKey = getProviderKey(book);

    if ((isbn && seenIsbns.has(isbn)) || (providerKey && seenProviderKeys.has(providerKey))) {
      return;
    }

    if (isbn) seenIsbns.add(isbn);
    if (providerKey) seenProviderKeys.add(providerKey);
    mergedResults.push(book);
  });

  // Ranking happens after every provider/catalog candidate has been merged.
  // Slicing here lets provider order discard a later exact catalog/title match.
  return mergedResults;
}

async function searchChineseBooks(searchTerm, limit, options = {}) {
  const [openLibrarySearch, catalogSearch] = await Promise.allSettled([
    searchOpenLibraryProvider(searchTerm, limit, options),
    searchCatalogBooks(searchTerm, limit),
  ]);
  const openLibraryResults = openLibrarySearch.status === "fulfilled"
    ? openLibrarySearch.value.results
    : [];
  const catalogResults = catalogSearch.status === "fulfilled"
    ? catalogSearch.value.results
    : [];

  if (catalogSearch.status === "rejected") {
    console.error("Book catalog search failed:", catalogSearch.reason);
  }

  if (openLibrarySearch.status === "rejected") {
    console.error("Open Library search failed:", openLibrarySearch.reason);
    if (catalogResults.length === 0) throw openLibrarySearch.reason;
  }

  return {
    results: mergeBookResults(openLibraryResults, catalogResults),
    blockedCount: openLibrarySearch.status === "fulfilled"
      ? openLibrarySearch.value.blockedCount || 0
      : 0,
  };
}

async function searchBooksByQueryLanguageRaw(searchTerm, limit = 20, options = {}) {
  const bypassProviderCache = Boolean(import.meta.env?.DEV && options.bypassProviderCache);
  if (isLikelyIsbn(searchTerm)) {
    const [openLibrarySearch, catalogSearch] = await Promise.allSettled([
      searchOpenLibraryProvider(searchTerm, limit, { bypassProviderCache }),
      searchCatalogBooks(searchTerm, limit),
    ]);
    const openLibraryResults = openLibrarySearch.status === "fulfilled"
      ? openLibrarySearch.value.results
      : [];
    const catalogResults = catalogSearch.status === "fulfilled"
      ? catalogSearch.value.results
      : [];

    if (catalogSearch.status === "rejected") {
      console.error("Book catalog search failed:", catalogSearch.reason);
    }

    if (openLibrarySearch.status === "rejected") {
      console.error("Open Library ISBN search failed:", openLibrarySearch.reason);
      if (catalogResults.length === 0) throw openLibrarySearch.reason;
    }

    return {
      results: mergeBookResults(openLibraryResults, catalogResults),
      blockedCount: openLibrarySearch.status === "fulfilled"
        ? openLibrarySearch.value.blockedCount || 0
        : 0,
    };
  }

  if (isChineseBookSearch(searchTerm)) {
    return searchChineseBooks(searchTerm, limit, { bypassProviderCache });
  }

  let catalogSearch = { results: [], blockedCount: 0, sufficient: false };

  try {
    catalogSearch = await searchCatalogBooks(searchTerm, limit);
  } catch (error) {
    // Catalog availability should not prevent a new external-book search.
    console.error("Supabase book catalog search failed:", error);
  }
  debugSearch("catalog result count", { query: searchTerm,
    resultCount: catalogSearch.results.length, sufficient: catalogSearch.sufficient });

  try {
    debugSearch("external provider invoked", { query: searchTerm, invoked: true });
    const combined = await searchCatalogAndExternal({
      searchCatalog: async () => catalogSearch,
      searchExternal: () => searchNonChineseExternalBooks(searchTerm, limit, { bypassProviderCache }),
      mergeResults: (externalResults, catalogResults) => mergeBookResults(
        externalResults, catalogResults,
      ),
    });
    return {
      results: combined.results,
      blockedCount: combined.blockedCount,
    };
  } catch (error) {
    console.error("External book search failed:", error);
    if (catalogSearch.results.length > 0) {
      return {
        results: catalogSearch.results,
        blockedCount: catalogSearch.blockedCount || 0,
      };
    }
    throw error;
  }
}

export async function searchBooksByQueryLanguage(searchTerm, limit = 20, options = {}) {
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  const result = await searchBooksByQueryLanguageRaw(searchTerm, limit, options);
  const providerDurationMs = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
  if (import.meta.env?.DEV) {
    console.debug("[book-search] provider", { providerDurationMs,
      firstResultsRenderedMs: providerDurationMs, resultCount: result.results.length });
  }
  const rankedResults = rankBookSearchResults(searchTerm, result.results, limit);
  if (import.meta.env?.DEV) {
    console.debug("[book-search] ranked pre-moderation results", rankedResults.slice(0, 10).map((book) => ({
      title: book.title || book.book || "", author: book.author || "",
      provider: book.source, providerRank: book.providerRank,
      relevanceScore: book.searchRelevanceScore,
    })));
  }
  const results = initializeBookModerationResults(rankedResults);
  return { ...result, results, providerDurationMs,
    startModeration: (onUpdate) => moderateBookSearchResults(results, onUpdate, providerDurationMs) };
}
