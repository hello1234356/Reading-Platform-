import {
  filterGoogleBooksResults,
  mapGoogleBooksResult,
  searchGoogleBooks,
} from "./googleBooks";
import { isLikelyIsbn, searchIsbnWorkBooks } from "./isbnWorkBooks";
import { searchOpenLibraryBooks } from "./openLibraryBooks";
import {
  normalizeCommunityBookIsbn,
  searchCommunityBooks,
} from "./communityBooks";

export function isChineseBookSearch(searchTerm) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(
    String(searchTerm || ""),
  );
}

async function searchExternalBooks(searchTerm, limit) {
  if (isChineseBookSearch(searchTerm)) {
    return searchOpenLibraryBooks(searchTerm, limit);
  }

  if (isLikelyIsbn(searchTerm)) {
    const isbnWorkResults = await searchIsbnWorkBooks(searchTerm, limit);
    if (isbnWorkResults.results.length > 0) {
      return isbnWorkResults;
    }
  }

  const googleResults = await searchGoogleBooks(searchTerm, limit);
  const { allowedResults, blockedCount } =
    filterGoogleBooksResults(googleResults);
  return {
    results: allowedResults.map((result) => ({
      ...mapGoogleBooksResult(result),
      source: "google_books",
    })),
    blockedCount,
  };
}

function getProviderKey(book) {
  if (book?.source === "google_books" && book.googleBooksId) {
    return `google_books:${book.googleBooksId}`;
  }

  if (book?.source === "open_library") {
    const externalId = book.openLibraryKey || book.editionKey || "";
    if (externalId) return `open_library:${externalId}`;
  }

  if (book?.source === "isbn_work" && book.isbn) {
    return `isbn_work:${normalizeCommunityBookIsbn(book.isbn)}`;
  }

  return "";
}

function mergeBookResults(externalResults = [], communityResults = []) {
  const mergedResults = [];
  const seenIsbns = new Set();
  const seenProviderKeys = new Set();

  communityResults.forEach((book) => {
    const isbn = normalizeCommunityBookIsbn(book.isbn);
    const providerKey = getProviderKey(book);

    if (isbn) seenIsbns.add(isbn);
    if (providerKey) seenProviderKeys.add(providerKey);
    mergedResults.push(book);
  });

  externalResults.forEach((book) => {
    const isbn = normalizeCommunityBookIsbn(book.isbn);
    const providerKey = getProviderKey(book);

    if ((isbn && seenIsbns.has(isbn)) || (providerKey && seenProviderKeys.has(providerKey))) {
      return;
    }

    if (isbn) seenIsbns.add(isbn);
    if (providerKey) seenProviderKeys.add(providerKey);
    mergedResults.push(book);
  });

  return mergedResults;
}

export async function searchBooksByQueryLanguage(searchTerm, limit = 20) {
  const [externalSearch, communitySearch] = await Promise.allSettled([
    searchExternalBooks(searchTerm, limit),
    searchCommunityBooks(searchTerm, limit),
  ]);

  const externalResults =
    externalSearch.status === "fulfilled" ? externalSearch.value.results : [];
  const communityResults =
    communitySearch.status === "fulfilled" ? communitySearch.value.results : [];

  if (communitySearch.status === "rejected") {
    console.error("Community book search failed:", communitySearch.reason);
  }

  if (externalSearch.status === "rejected") {
    console.error("External book search failed:", externalSearch.reason);

    if (communityResults.length === 0) {
      throw externalSearch.reason;
    }
  }

  return {
    results: mergeBookResults(externalResults, communityResults),
    blockedCount:
      externalSearch.status === "fulfilled"
        ? externalSearch.value.blockedCount || 0
        : 0,
  };
}
