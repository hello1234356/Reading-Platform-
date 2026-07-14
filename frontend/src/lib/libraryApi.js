import { requireSupabase } from "./supabase";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

const allowedShelves = [
  null,
  "to-be-read",
  "currently-reading",
  "read",
];

function mapLibraryRow(row) {
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
    coverUrl: row.books.cover_url,
  };
}

export async function addBookToLibrary(userId, book, targetShelf = null) {
  if (!userId) {
    throw new Error("You must be logged in to save a book.");
  }

  const supabase = requireSupabase();
  const normalizedIsbn = normalizeIsbn(book.isbn);
  const nextShelf = targetShelf || null;

  if (!allowedShelves.includes(nextShelf)) {
    throw new Error("That shelf is not valid.");
  }

  if (!book.title?.trim()) {
    throw new Error("This book is missing a title.");
  }

  if (!normalizedIsbn) {
    throw new Error(
      "This Open Library result has no ISBN. Choose another edition for now.",
    );
  }

  /*
   * First, find the shared book row by ISBN.
   */
  const { data: existingBook, error: findBookError } = await supabase
    .from("books")
    .select("id, title, author, isbn, cover_url")
    .eq("isbn", normalizedIsbn)
    .maybeSingle();

  if (findBookError) {
    throw findBookError;
  }

  let savedBook = existingBook;

  /*
   * If the book is not in the catalog yet, create it.
   */
  if (!savedBook) {
    const { data: insertedBook, error: insertBookError } = await supabase
      .from("books")
      .insert({
        title: book.title.trim(),
        author: book.author?.trim() || "Unknown author",
        isbn: normalizedIsbn,
        cover_url: book.coverUrl || null,
        description: null,
        genre: null,
        shelf: null,
      })
      .select("id, title, author, isbn, cover_url")
      .single();

    if (insertBookError) {
      /*
       * Another user may have inserted the same ISBN between our
       * lookup and insert. In that case, fetch the existing row.
       */
      if (insertBookError.code !== "23505") {
        throw insertBookError;
      }

      const { data: concurrentBook, error: concurrentBookError } =
        await supabase
          .from("books")
          .select("id, title, author, isbn, cover_url")
          .eq("isbn", normalizedIsbn)
          .single();

      if (concurrentBookError) {
        throw concurrentBookError;
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
        cover_url
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
      rating,
      created_at,
      books (
        id,
        title,
        author,
        isbn,
        genre,
        description,
        cover_url
      )
    `)
    .single();

  if (error) {
    throw error;
  }

  return mapLibraryRow(data);
}
