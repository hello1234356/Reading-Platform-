import {
  isGoogleBooksQuotaError,
  mapGoogleBooksResult,
  searchGoogleBooks,
} from "./googleBooks";
import { isLikelyIsbn } from "./isbnWorkBooks";
import { searchOpenLibraryBooks } from "./openLibraryBooks";
import {
  normalizeCommunityBookIsbn,
  searchCatalogBooks,
  searchCommunityBooks,
} from "./communityBooks";
import { searchWithSharedCache } from "./bookSearchCache";
import { searchGoogleWithQuotaFallback } from "./bookSearchPolicy";
import { enforceBookSearchResults } from "./bookModerationApi";

export function isChineseBookSearch(searchTerm) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(
    String(searchTerm || ""),
  );
}

async function searchGoogleProvider(searchTerm, limit) {
  return searchWithSharedCache({
    provider: "google_books",
    searchTerm,
    limit,
    fetchResults: async () => {
      const googleResults = await searchGoogleBooks(searchTerm, limit);
      return {
        results: googleResults.map((result) => ({
          ...mapGoogleBooksResult(result),
          source: "google_books",
        })),
        blockedCount: 0,
      };
    },
  });
}

async function searchOpenLibraryProvider(searchTerm, limit) {
  return searchWithSharedCache({
    provider: "open_library",
    searchTerm,
    limit,
    fetchResults: () => searchOpenLibraryBooks(searchTerm, limit),
  });
}

async function searchNonChineseExternalBooks(searchTerm, limit) {
  return searchGoogleWithQuotaFallback({
    searchGoogle: () => searchGoogleProvider(searchTerm, limit),
    searchOpenLibrary: () => searchOpenLibraryProvider(searchTerm, limit),
    isQuotaError: isGoogleBooksQuotaError,
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

function mergeBookResults(preferredResults = [], additionalResults = [], limit = 20) {
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

  return mergedResults.slice(0, limit);
}

async function searchChineseBooks(searchTerm, limit) {
  const [openLibrarySearch, communitySearch] = await Promise.allSettled([
    searchOpenLibraryProvider(searchTerm, limit),
    searchCommunityBooks(searchTerm, limit),
  ]);
  const openLibraryResults = openLibrarySearch.status === "fulfilled"
    ? openLibrarySearch.value.results
    : [];
  const communityResults = communitySearch.status === "fulfilled"
    ? communitySearch.value.results
    : [];

  if (communitySearch.status === "rejected") {
    console.error("Community book search failed:", communitySearch.reason);
  }

  if (openLibrarySearch.status === "rejected") {
    console.error("Open Library search failed:", openLibrarySearch.reason);
    if (communityResults.length === 0) throw openLibrarySearch.reason;
  }

  return {
    results: mergeBookResults(openLibraryResults, communityResults, limit),
    blockedCount: openLibrarySearch.status === "fulfilled"
      ? openLibrarySearch.value.blockedCount || 0
      : 0,
  };
}

async function searchBooksByQueryLanguageRaw(searchTerm, limit = 20) {
  if (isLikelyIsbn(searchTerm)) {
    const [openLibrarySearch, communitySearch] = await Promise.allSettled([
      searchOpenLibraryProvider(searchTerm, limit),
      searchCommunityBooks(searchTerm, limit),
    ]);
    const openLibraryResults = openLibrarySearch.status === "fulfilled"
      ? openLibrarySearch.value.results
      : [];
    const communityResults = communitySearch.status === "fulfilled"
      ? communitySearch.value.results
      : [];

    if (communitySearch.status === "rejected") {
      console.error("Community book search failed:", communitySearch.reason);
    }

    if (openLibrarySearch.status === "rejected") {
      console.error("Open Library ISBN search failed:", openLibrarySearch.reason);
      if (communityResults.length === 0) throw openLibrarySearch.reason;
    }

    return {
      results: mergeBookResults(openLibraryResults, communityResults, limit),
      blockedCount: openLibrarySearch.status === "fulfilled"
        ? openLibrarySearch.value.blockedCount || 0
        : 0,
    };
  }

  if (isChineseBookSearch(searchTerm)) {
    return searchChineseBooks(searchTerm, limit);
  }

  let catalogSearch = { results: [], blockedCount: 0, sufficient: false };

  try {
    catalogSearch = await searchCatalogBooks(searchTerm, limit);
  } catch (error) {
    // Catalog availability should not prevent a new external-book search.
    console.error("Supabase book catalog search failed:", error);
  }

  if (catalogSearch.sufficient) {
    return {
      results: catalogSearch.results,
      blockedCount: catalogSearch.blockedCount || 0,
    };
  }

  try {
    const externalSearch = await searchNonChineseExternalBooks(searchTerm, limit);
    return {
      results: mergeBookResults(
        externalSearch.results,
        catalogSearch.results,
        limit,
      ),
      blockedCount: externalSearch.blockedCount || 0,
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

export async function searchBooksByQueryLanguage(searchTerm, limit = 20) {
  const result = await searchBooksByQueryLanguageRaw(searchTerm, limit);
  const moderated = await enforceBookSearchResults(result.results);
  return { ...result, results: moderated.results,
    blockedCount: (result.blockedCount || 0) + moderated.withheldCount,
    moderationMessage: moderated.message };
}
