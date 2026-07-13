import { requireSupabase } from "./supabase";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export async function addBookToLibrary(userId, book) {
  if (!userId) {
    throw new Error("You must be logged in to save a book.");
  }

  const supabase = requireSupabase();
  const normalizedIsbn = normalizeIsbn(book.isbn);

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
   * New books begin on the To Be Read shelf.
   */
  const { data: shelfRow, error: shelfError } = await supabase
    .from("shelves")
    .upsert(
      {
        user_id: userId,
        book_id: savedBook.id,
        shelf: "to-be-read",
        progress: 0,
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
    return {
      shelf: shelfRow,
      book: savedBook,
    };
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

  return {
    shelf: existingShelfRow,
    book: savedBook,
  };
}