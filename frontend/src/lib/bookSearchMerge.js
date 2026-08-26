import { normalizeCommunityBookIsbn } from "./communityBooks.js";

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
  if (book?.source && book?.externalId) return `${book.source}:${book.externalId}`;
  return "";
}

function mergeDuplicate(preferred, additional) {
  const merged = { ...additional, ...preferred,
    bookId: preferred.bookId || additional.bookId };
  ["coverUrl", "publisher", "genre", "language", "firstPublished", "isbn"].forEach((field) => {
    if (!merged[field] && additional[field]) merged[field] = additional[field];
  });
  if (String(additional.description || "").length > String(preferred.description || "").length) {
    merged.description = additional.description;
  }
  return merged;
}

export function mergeBookResults(preferredResults = [], additionalResults = []) {
  const mergedResults = [];
  const isbnIndexes = new Map();
  const providerIndexes = new Map();

  preferredResults.concat(additionalResults).forEach((book) => {
    const isbn = normalizeCommunityBookIsbn(book.isbn);
    const providerKey = getProviderKey(book);
    const existingIndex = providerKey && providerIndexes.has(providerKey)
      ? providerIndexes.get(providerKey)
      : isbn && isbnIndexes.has(isbn) ? isbnIndexes.get(isbn) : undefined;

    if (existingIndex !== undefined) {
      const merged = mergeDuplicate(mergedResults[existingIndex], book);
      mergedResults[existingIndex] = merged;
      const mergedIsbn = normalizeCommunityBookIsbn(merged.isbn);
      const mergedProviderKey = getProviderKey(merged);
      if (mergedIsbn) isbnIndexes.set(mergedIsbn, existingIndex);
      if (mergedProviderKey) providerIndexes.set(mergedProviderKey, existingIndex);
      return;
    }

    const nextIndex = mergedResults.length;
    if (isbn) isbnIndexes.set(isbn, nextIndex);
    if (providerKey) providerIndexes.set(providerKey, nextIndex);
    mergedResults.push(book);
  });

  // Ranking happens only after all provider and catalog candidates are merged.
  return mergedResults;
}
