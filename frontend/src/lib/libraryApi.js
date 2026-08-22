import { requireSupabase } from "./supabase";
import {
  enrichBooksWithGoogleBooks,
  getPreferredGoogleBooksCoverUrl,
} from "./googleBooks";
import { getIsbnWorkBookDetails } from "./isbnWorkBooks";

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

function mapLibraryRow(row) {
  const bookSource = row.books.source || "";

  return {
    shelfEntryId: row.id,
    bookId: row.book_id,
    shelf: row.shelf,
    progress: row.progress ?? 0,
    rating: row.rating,
    createdAt: row.created_at,

    title: row.books.title,
    author: row.books.author,
    isbn: row.books.isbn,
    genre: row.books.genre,
    description: row.books.description,
    source: bookSource,
    externalId: row.books.external_id || "",
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
  let bookToPersist = book;

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
    bookToPersist = await getIsbnWorkBookDetails({
      ...book,
      isbn: normalizedIsbn,
    });
    providerIdentity = getProviderIdentity(bookToPersist, normalizedIsbn);

    if (!providerIdentity) {
      throw new Error(
        "This ISBN-only book could not be resolved through ISBN.work. Search for it from a supported provider first.",
      );
    }
  }

  /*
   * If the book is not in the catalog yet, create it.
   */
  if (!savedBook) {
    if (!bookToPersist.title?.trim()) {
      throw new Error("This book is missing a title.");
    }

    const { data: insertedBook, error: insertBookError } = await supabase
      .from("books")
      .insert({
        title: bookToPersist.title.trim(),
        author: bookToPersist.author?.trim() || "Unknown author",
        isbn: normalizedIsbn || null,
        source: providerIdentity.source,
        external_id: providerIdentity.externalId,
        cover_url: bookToPersist.coverUrl || null,
        description: bookToPersist.description || null,
        genre: bookToPersist.genre || null,
        shelf: null,
      })
      .select("id, title, author, isbn, cover_url, source, external_id")
      .single();

    if (insertBookError) {
      /*
       * Another user may have inserted the same ISBN between our
       * lookup and insert. In that case, fetch the existing row.
       */
      if (insertBookError.code !== "23505") {
        throw insertBookError;
      }

      let concurrentBook = null;

      if (providerIdentity) {
        const { data, error } = await supabase
          .from("books")
          .select("id, title, author, isbn, cover_url, source, external_id")
          .eq("source", providerIdentity.source)
          .eq("external_id", providerIdentity.externalId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        concurrentBook = data;
      }

      if (!concurrentBook && normalizedIsbn) {
        const { data, error } = await supabase
          .from("books")
          .select("id, title, author, isbn, cover_url, source, external_id")
          .eq("isbn", normalizedIsbn)
          .maybeSingle();

        if (error) {
          throw error;
        }

        concurrentBook = data;
      }

      if (!concurrentBook) {
        throw insertBookError;
      }

      savedBook = concurrentBook;
    } else {
      savedBook = insertedBook;
    }
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
        progress: nextShelf === "read" ? 100 : 0,
        rating: null,
      },
      {
        onConflict: "user_id,book_id",
        ignoreDuplicates: true,
      },
    )
    .select("id, user_id, book_id, shelf, progress, rating")
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
    .select("id, user_id, book_id, shelf, progress, rating")
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
      progress: nextShelf === "read" ? 100 : existingShelfRow.progress ?? 0,
    })
    .eq("id", existingShelfRow.id)
    .select("id, user_id, book_id, shelf, progress, rating")
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
      rating,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        genre,
        description,
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

  const books = (data || []).filter((row) => row.books).map(mapLibraryRow);
  return enrichBooksWithGoogleBooks(books);
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
      rating,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        genre,
        description,
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

export async function updateLibraryBookProgress(shelfEntryId, progress) {
  if (!shelfEntryId) {
    throw new Error("This library entry is missing its ID.");
  }

  const nextProgress = Math.max(0, Math.min(Number(progress) || 0, 100));
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("shelves")
    .update({
      progress: nextProgress,
      shelf: nextProgress >= 100 ? "read" : "currently-reading",
    })
    .eq("id", shelfEntryId)
    .select(`
      id,
      user_id,
      book_id,
      shelf,
      progress,
      rating,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        genre,
        description,
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
