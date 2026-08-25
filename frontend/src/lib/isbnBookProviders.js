import { mapGoogleBooksResult, searchGoogleBooks } from "./googleBooks.js";
import {
  getOpenLibraryBookDetails,
  searchOpenLibraryBooks,
} from "./openLibraryBooks.js";

const LEGACY_DETAIL_ERROR =
  "We couldn't load extra book details right now. The saved book information is still available.";

export function normalizeBookIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isLikelyIsbn(searchTerm) {
  const normalized = normalizeBookIsbn(searchTerm);
  return normalized.length === 10 || normalized.length === 13;
}

function hasOpenLibraryIdentity(book) {
  return Boolean(book?.openLibraryKey || book?.editionKey);
}

async function resolveOpenLibraryIsbn(isbn, searchOpenLibrary) {
  try {
    const response = await searchOpenLibrary(isbn, 10);
    return (response?.results || []).find(hasOpenLibraryIdentity) || null;
  } catch {
    return null;
  }
}

export async function resolveIsbnBookFromExistingProviders(isbn, options = {}) {
  const normalizedIsbn = normalizeBookIsbn(isbn);
  if (!isLikelyIsbn(normalizedIsbn)) return null;

  const searchOpenLibrary = options.searchOpenLibrary || searchOpenLibraryBooks;
  const searchGoogle = options.searchGoogle || searchGoogleBooks;
  const openLibraryBook = await resolveOpenLibraryIsbn(normalizedIsbn, searchOpenLibrary);

  if (openLibraryBook) {
    const externalId = openLibraryBook.openLibraryKey || openLibraryBook.editionKey;
    return {
      ...openLibraryBook,
      source: "open_library",
      externalId,
    };
  }

  try {
    const googleResults = await searchGoogle(`isbn:${normalizedIsbn}`, 1);
    const googleResult = (googleResults || []).find((result) => result?.id);
    if (!googleResult) return null;
    const mapped = mapGoogleBooksResult(googleResult);
    return {
      ...mapped,
      source: "google_books",
      externalId: mapped.googleBooksId,
    };
  } catch {
    return null;
  }
}

function needsLegacyEnrichment(book) {
  return Boolean(normalizeBookIsbn(book?.isbn)) && (
    !String(book?.description || "").trim() ||
    !String(book?.coverUrl || "").trim() ||
    !String(book?.publisher || "").trim() ||
    !book?.firstPublished
  );
}

export async function getLegacyIsbnBookDetails(book, options = {}) {
  const storedBook = { ...book };
  if (!needsLegacyEnrichment(storedBook)) return storedBook;

  const searchOpenLibrary = options.searchOpenLibrary || searchOpenLibraryBooks;
  const loadOpenLibraryDetails = options.loadOpenLibraryDetails || getOpenLibraryBookDetails;
  const openLibraryBook = await resolveOpenLibraryIsbn(
    normalizeBookIsbn(storedBook.isbn),
    searchOpenLibrary,
  );

  if (!openLibraryBook) {
    return { ...storedBook, error: LEGACY_DETAIL_ERROR };
  }

  try {
    const details = await loadOpenLibraryDetails(openLibraryBook);
    return {
      ...storedBook,
      title: storedBook.title || details.title,
      author: storedBook.author || details.author,
      description: storedBook.description || details.description || "",
      coverUrl: storedBook.coverUrl || details.coverUrl || "",
      publisher: storedBook.publisher || details.publisher || "",
      firstPublished: storedBook.firstPublished || details.firstPublished || null,
      genre: storedBook.genre || details.genre || "",
      language: storedBook.language || details.language || "",
      source: storedBook.source,
      externalId: storedBook.externalId,
      error: details.error ? LEGACY_DETAIL_ERROR : "",
    };
  } catch {
    return { ...storedBook, error: LEGACY_DETAIL_ERROR };
  }
}
