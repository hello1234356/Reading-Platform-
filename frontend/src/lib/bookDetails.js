import { getGoogleBooksBookDetails } from "./googleBooks.js";
import { getLegacyIsbnBookDetails } from "./isbnBookProviders.js";
import { getOpenLibraryBookDetails } from "./openLibraryBooks.js";

export const BOOK_DETAIL_LOAD_ERROR =
  "We couldn't load extra book details right now. The saved book information is still available.";

export async function loadProviderBookDetails(book) {
  if (book?.source === "community") {
    return {
      ...book,
      description: book.description || "LitShelf does not have a description for this book yet.",
    };
  }
  if (book?.source === "legacy_catalog") {
    return {
      ...book,
      description: book.description || "No description is stored for this legacy catalog record.",
    };
  }
  if (book?.source === "open_library") return getOpenLibraryBookDetails(book);
  if (book?.source === "isbn_work") return getLegacyIsbnBookDetails(book);
  return getGoogleBooksBookDetails(book);
}

export async function loadBookDetailsSafely(book, loadDetails) {
  try {
    const details = await loadDetails(book);
    return {
      details: details || book,
      error: details?.error || "",
    };
  } catch {
    return {
      details: { ...book },
      error: BOOK_DETAIL_LOAD_ERROR,
    };
  }
}
