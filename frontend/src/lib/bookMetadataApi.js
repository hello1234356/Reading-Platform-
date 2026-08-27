import { requireSupabase } from "./supabase.js";

function getBookId(book) {
  return book?.bookId || book?.id || null;
}

function getExternalId(book) {
  if (book?.source === "google_books") {
    return book.googleBooksId || book.externalId || "";
  }

  if (book?.source === "open_library") {
    return book.openLibraryKey || book.editionKey || book.externalId || "";
  }

  return book?.externalId || "";
}

export async function persistMissingBookMetadata(book, metadata) {
  const bookId = getBookId(book);
  if (!bookId) return null;

  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.user) return null;

  const publicationYear = Number(
    metadata?.firstPublished || metadata?.publicationYear,
  );
  const storedSource = book?.source === "legacy_catalog" ? "" : book?.source || "";
  const { data, error } = await supabase.rpc("fill_missing_book_metadata", {
    p_book_id: bookId,
    p_source: storedSource,
    p_external_id: getExternalId(book),
    p_isbn: book?.isbn || metadata?.isbn || "",
    p_description: metadata?.description || null,
    p_cover_url: metadata?.coverUrl || null,
    p_publisher: metadata?.publisher || null,
    p_publication_year: Number.isInteger(publicationYear)
      ? publicationYear
      : null,
    p_genre: metadata?.genre || null,
    p_language: metadata?.language || null,
  });

  if (error) throw error;
  return data;
}

export async function persistMaterializedBookMetadata(bookRow, metadata) {
  if (!bookRow?.id) return bookRow;

  const persisted = await persistMissingBookMetadataSafely(
    {
      bookId: bookRow.id,
      source: bookRow.source || "",
      externalId: bookRow.external_id || "",
      isbn: bookRow.isbn || metadata?.isbn || "",
    },
    metadata,
  );

  return persisted || bookRow;
}

export async function persistMissingBookMetadataSafely(book, metadata) {
  try {
    return await persistMissingBookMetadata(book, metadata);
  } catch {
    // Metadata persistence is best-effort and must never block the detail UI.
    if (import.meta.env?.DEV) {
      console.debug("[book-metadata] optional metadata writeback failed", {
        bookId: getBookId(book),
        source: book?.source || "legacy_catalog",
      });
    }
    return null;
  }
}
