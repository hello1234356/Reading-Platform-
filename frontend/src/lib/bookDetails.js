import { getGoogleBooksBookDetails } from "./googleBooks.js";
import { getLegacyIsbnBookDetails } from "./isbnBookProviders.js";
import { getOpenLibraryBookDetails } from "./openLibraryBooks.js";
import { persistMissingBookMetadataSafely } from "./bookMetadataApi.js";

export const BOOK_DETAIL_LOAD_ERROR =
  "We couldn't load extra book details right now. The saved book information is still available.";
export const NO_BOOK_DESCRIPTION =
  "No description is available for this edition yet.";

export function hasStoredBookDescription(book) {
  return Boolean(book?.bookId && String(book?.description || "").trim());
}

function isProviderPlaceholderDescription(value) {
  const description = String(value || "").trim();
  return !description || /does not have an official description|no description is available|LitShelf does not have a description|couldn't load extra book details/i.test(description);
}

export async function loadProviderBookDetails(book) {
  if (hasStoredBookDescription(book)) return { ...book };

  if (book?.source === "community") {
    return {
      ...book,
      description: book.description || "LitShelf does not have a description for this book yet.",
    };
  }
  if (book?.source === "legacy_catalog") {
    return book?.isbn
      ? getLegacyIsbnBookDetails(book)
      : { ...book, description: NO_BOOK_DESCRIPTION };
  }
  if (book?.source === "open_library") return getOpenLibraryBookDetails(book);
  if (book?.source === "isbn_work") return getLegacyIsbnBookDetails(book);
  return getGoogleBooksBookDetails(book);
}

export async function loadBookDetailsSafely(book, loadDetails, options = {}) {
  const persistMetadata = options.persistMetadata || persistMissingBookMetadataSafely;

  try {
    const details = await loadDetails(book);
    const { error: providerError, ...providerDetails } = details || {};
    const recoveredDescription = providerError || isProviderPlaceholderDescription(
      providerDetails.description,
    ) ? "" : String(providerDetails.description).trim();
    const resolvedDetails = {
      ...book,
      ...providerDetails,
      description:
        recoveredDescription || String(book?.description || "").trim() ||
        NO_BOOK_DESCRIPTION,
    };

    const canPersistEnrichment =
      book?.source !== "community" &&
      !(book?.source === "legacy_catalog" && !book?.isbn);

    if (
      book?.bookId &&
      !hasStoredBookDescription(book) &&
      !providerError &&
      canPersistEnrichment
    ) {
      await persistMetadata(book, {
        ...resolvedDetails,
        description: recoveredDescription,
      });
    }

    if (providerError && import.meta.env?.DEV) {
      console.debug("[book-details] optional metadata enrichment failed", {
        bookId: book?.bookId || null,
        source: book?.source || "legacy_catalog",
      });
    }

    return {
      details: resolvedDetails,
      error: "",
    };
  } catch {
    return {
      details: {
        ...book,
        description:
          String(book?.description || "").trim() || NO_BOOK_DESCRIPTION,
      },
      error: "",
    };
  }
}

export async function enrichMissingBookCovers(
  books = [],
  loadDetails = loadProviderBookDetails,
) {
  return Promise.all(
    books.map(async (book) => {
      if (String(book?.coverUrl || "").trim()) return book;

      const result = await loadBookDetailsSafely(book, loadDetails);
      const coverUrl = String(result.details?.coverUrl || "").trim();
      if (!coverUrl) return book;

      return {
        ...result.details,
        ...book,
        coverUrl,
      };
    }),
  );
}
