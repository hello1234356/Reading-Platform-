import { requireSupabase } from "./supabase";
import { getPreferredGoogleBooksCoverUrl } from "./googleBooks";
import { resolveIsbnBookFromExistingProviders } from "./isbnBookProviders";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function getInternalBookId(book) {
  return book?.bookId || book?.id || "";
}

function getProviderIdentity(book, normalizedIsbn = "") {
  if (book?.source === "google_books" && book.googleBooksId) {
    return {
      source: "google_books",
      externalId: String(book.googleBooksId),
    };
  }

  if (book?.source === "open_library") {
    const externalId = book.openLibraryKey || book.editionKey || "";

    if (externalId) {
      return {
        source: "open_library",
        externalId: String(externalId),
      };
    }
  }

  if (book?.source === "isbn_work" && normalizedIsbn) {
    return {
      source: "isbn_work",
      externalId: normalizedIsbn,
    };
  }

  return null;
}

const allowedShelves = [
  null,
  "to-be-read",
  "currently-reading",
  "read",
];

function normalizeShelfProgress(shelf, progress) {
  if (shelf === "read") return 100;
  if (shelf === "to-be-read") return 0;
  return Math.max(0, Math.min(Number(progress) || 0, 100));
}

function normalizePageCount(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.max(0, Math.round(number));
}

function normalizeTotalPages(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) return null;

  return Math.round(number);
}

function calculateProgress({ shelf, progress, pagesRead, totalPages }) {
  if (shelf === "read") return 100;
  if (shelf === "to-be-read") return 0;

  if (totalPages > 0) {
    return Math.max(
      0,
      Math.min(Math.round((pagesRead / totalPages) * 100), 100),
    );
  }

  return normalizeShelfProgress(shelf, progress);
}

function mapLibraryRow(row) {
  const bookSource = row.books.source || "";
  const shelf = row.shelf;
  const totalPages = normalizeTotalPages(row.total_pages);
  const pagesRead =
    shelf === "read" && totalPages
      ? totalPages
      : Math.min(normalizePageCount(row.pages_read), totalPages || Infinity);
  const progress = calculateProgress({
    shelf,
    progress: row.progress,
    pagesRead,
    totalPages,
  });

  return {
    shelfEntryId: row.id,
    bookId: row.book_id,
    shelf,
    progress,
    pagesRead,
    totalPages,
    rating: row.rating,
    createdAt: row.created_at,

    title: row.books.title,
    author: row.books.author,
    isbn: row.books.isbn,
    genre: row.books.genre,
    description: row.books.description,
    publisher: row.books.publisher || "",
    firstPublished: row.books.publication_year || null,
    language: row.books.language || "",
    source: bookSource,
    externalId: row.books.external_id || "",
    googleBooksId:
      bookSource === "google_books" ? row.books.external_id || "" : "",
    skipGoogleBooksEnrichment: bookSource !== "google_books",
    coverUrl:
      bookSource === "google_books"
        ? getPreferredGoogleBooksCoverUrl(row.books.cover_url, row.books.isbn)
        : row.books.cover_url || "",
  };
}

export async function addBookToLibrary(userId, book, targetShelf = null) {
  if (!userId) {
    throw new Error("You must be logged in to save a book.");
  }

  const supabase = requireSupabase();
  const normalizedIsbn = normalizeIsbn(book.isbn);
  const nextShelf = targetShelf || null;
  const internalBookId = getInternalBookId(book);
  let providerIdentity = getProviderIdentity(book, normalizedIsbn);

  if (!allowedShelves.includes(nextShelf)) {
    throw new Error("That shelf is not valid.");
  }

  let savedBook = null;

  if (internalBookId) {
    const { data: existingBookById, error: findBookByIdError } =
      await supabase
        .from("books")
        .select("id, title, author, isbn, cover_url")
        .eq("id", internalBookId)
        .maybeSingle();

    if (findBookByIdError) {
      throw findBookByIdError;
    }

    savedBook = existingBookById;
  }

  if (!savedBook && providerIdentity) {
    const { data: existingBookByProvider, error: findBookByProviderError } =
      await supabase
        .from("books")
        .select("id, title, author, isbn, cover_url, source, external_id")
        .eq("source", providerIdentity.source)
        .eq("external_id", providerIdentity.externalId)
        .maybeSingle();

    if (findBookByProviderError) {
      throw findBookByProviderError;
    }

    savedBook = existingBookByProvider;
  }

  if (!savedBook && normalizedIsbn) {
    /*
     * ISBN remains a compatibility/import lookup for external results.
     */
    const { data: existingBook, error: findBookError } = await supabase
      .from("books")
      .select("id, title, author, isbn, cover_url")
      .eq("isbn", normalizedIsbn)
      .maybeSingle();

    if (findBookError) {
      throw findBookError;
    }

    savedBook = existingBook;
  }

  if (!savedBook && !providerIdentity && !normalizedIsbn) {
    throw new Error(
      "This book is not in LitShelf yet and has no stable provider identity or ISBN. Choose another edition for now.",
    );
  }

  if (!savedBook && !providerIdentity) {
    const resolvedBook = await resolveIsbnBookFromExistingProviders(normalizedIsbn);
    providerIdentity = getProviderIdentity(resolvedBook, normalizedIsbn);

    if (!providerIdentity) {
      throw new Error(
        "This ISBN could not be resolved through Open Library or Google Books. Search for another edition for now.",
      );
    }
  }

  /*
   * If the book is not in the catalog yet, create it.
   */
  if (!savedBook) {
    const { data: insertedBook, error: insertBookError } = await supabase.rpc(
      "materialize_approved_book",
      { p_source: providerIdentity.source, p_external_id: providerIdentity.externalId },
    );
    if (insertBookError) throw insertBookError;
    savedBook = insertedBook;
  }

  /*
   * Then connect that book to this user's personal library.
   * New books begin in the uncategorized My Reading List area
   */
  const { data: shelfRow, error: shelfError } = await supabase
    .from("shelves")
    .upsert(
      {
        user_id: userId,
        book_id: savedBook.id,
        shelf: nextShelf,
        progress: normalizeShelfProgress(nextShelf, 0),
        pages_read: 0,
        rating: null,
      },
      {
        onConflict: "user_id,book_id",
        ignoreDuplicates: true,
      },
    )
    .select("id, user_id, book_id, shelf, progress, pages_read, total_pages, rating")
    .single();

  if (shelfError) {
    /*
     * With ignoreDuplicates, an existing row may not be returned.
     * Fetch it so the caller still receives the saved library item.
     */
    if (shelfError.code !== "PGRST116") {
      throw shelfError;
    }
  }

  if (shelfRow) {
    return { shelf: shelfRow, book: savedBook };
  }

  const { data: existingShelfRow, error: existingShelfError } = await supabase
    .from("shelves")
    .select("id, user_id, book_id, shelf, progress, pages_read, total_pages, rating")
    .eq("user_id", userId)
    .eq("book_id", savedBook.id)
    .single();

  if (existingShelfError) {
    throw existingShelfError;
  }

  const { data: updatedShelfRow, error: updateShelfError } = await supabase
    .from("shelves")
    .update({
      shelf: nextShelf,
      progress: normalizeShelfProgress(nextShelf, existingShelfRow.progress),
      pages_read:
        nextShelf === "read" && existingShelfRow.total_pages
          ? existingShelfRow.total_pages
          : nextShelf === "to-be-read"
            ? 0
            : existingShelfRow.pages_read || 0,
    })
    .eq("id", existingShelfRow.id)
    .select("id, user_id, book_id, shelf, progress, pages_read, total_pages, rating")
    .single();

  if (updateShelfError) {
    throw updateShelfError;
  }

  return { shelf: updatedShelfRow, book: savedBook };
}
export async function getUserLibrary(userId) {
  if (!userId) {
    return [];
  }

  const supabase = requireSupabase();

  const { data, error } = await supabase
    .from("shelves")
    .select(`
      id,
      user_id,
      book_id,
      shelf,
      progress,
      pages_read,
      total_pages,
      rating,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        genre,
        description,
        publisher,
        publication_year,
        language,
        cover_url,
        source,
        external_id
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).filter((row) => row.books).map(mapLibraryRow);
}
export async function moveLibraryBook(shelfEntryId, nextShelf) {
  if (!shelfEntryId) {
    throw new Error("This library entry is missing its ID.");
  }

  if (!allowedShelves.includes(nextShelf)) {
    throw new Error("That shelf is not valid.");
  }

  const supabase = requireSupabase();

  const updates = {
    shelf: nextShelf,
  };

  // These defaults make the status internally consistent.
  if (nextShelf === "read") {
    updates.progress = 100;
  }

  if (nextShelf === "to-be-read") {
    updates.progress = 0;
  }

  const { data, error } = await supabase
    .from("shelves")
    .update(updates)
    .eq("id", shelfEntryId)
    .select(`
      id,
      user_id,
      book_id,
      shelf,
      progress,
      pages_read,
      total_pages,
      rating,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        genre,
        description,
        publisher,
        publication_year,
        language,
        cover_url,
        source,
        external_id
      )
    `)
    .single();

  if (error) {
    throw error;
  }

  return mapLibraryRow(data);
}

export async function updateLibraryBookProgress(shelfEntryId, progressUpdate) {
  if (!shelfEntryId) {
    throw new Error("This library entry is missing its ID.");
  }

  const hasPageUpdate =
    typeof progressUpdate === "object" && progressUpdate !== null;
  const totalPages = hasPageUpdate
    ? normalizeTotalPages(progressUpdate.totalPages)
    : null;
  const pagesRead = hasPageUpdate
    ? Math.min(
        normalizePageCount(progressUpdate.pagesRead),
        totalPages || Infinity,
      )
    : 0;
  const nextProgress = hasPageUpdate
    ? calculateProgress({
        shelf: "currently-reading",
        progress: 0,
        pagesRead,
        totalPages,
      })
    : Math.max(0, Math.min(Number(progressUpdate) || 0, 100));
  const shouldFinish = nextProgress >= 100;
  const updatePayload = {
    progress: nextProgress,
    shelf: shouldFinish ? "read" : "currently-reading",
  };

  if (hasPageUpdate) {
    updatePayload.pages_read = shouldFinish && totalPages ? totalPages : pagesRead;
    updatePayload.total_pages = totalPages;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("shelves")
    .update(updatePayload)
    .eq("id", shelfEntryId)
    .select(`
      id,
      user_id,
      book_id,
      shelf,
      progress,
      pages_read,
      total_pages,
      rating,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        genre,
        description,
        publisher,
        publication_year,
        language,
        cover_url,
        source,
        external_id
      )
    `)
    .single();

  if (error) {
    throw error;
  }

  return mapLibraryRow(data);
}
export async function removeLibraryBook(shelfEntryId) {
  if (!shelfEntryId) {
    throw new Error("This library entry is missing its ID.");
  }

  const supabase = requireSupabase();

  const { error } = await supabase
    .from("shelves")
    .delete()
    .eq("id", shelfEntryId);

  if (error) {
    throw error;
  }
}
