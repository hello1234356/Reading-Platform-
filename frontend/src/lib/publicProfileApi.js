import { requireSupabase } from "./supabase";

function getCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

export async function getPublicProfile(userId) {
  if (!userId) {
    throw new Error("A user ID is required.");
  }

  const supabase = requireSupabase();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      username,
      grade,
      bio,
      avatar_url,
      favorite_book_1,
      favorite_book_2,
      favorite_book_3,
      favorite_book_4
    `)
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile) {
    throw new Error("This profile could not be found.");
  }

  const favoriteIsbns = [
    profile.favorite_book_1,
    profile.favorite_book_2,
    profile.favorite_book_3,
    profile.favorite_book_4,
  ]
    .filter(Boolean)
    .map(String);

  if (favoriteIsbns.length === 0) {
    return {
      ...profile,
      favoriteBooks: [],
    };
  }

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select(`
      id,
      title,
      author,
      isbn,
      cover_url,
      description
    `)
    .in("isbn", favoriteIsbns);

  if (booksError) {
    throw booksError;
  }

  const booksByIsbn = new Map(
    (books || []).map((book) => [
      String(book.isbn),
      {
        ...book,
        coverUrl:
          book.cover_url || getCoverUrl(book.isbn),
      },
    ]),
  );

  /*
   * Build the books in favorite_book_1 through
   * favorite_book_4 order.
   */
  const favoriteBooks = favoriteIsbns.map((isbn) => {
    return (
      booksByIsbn.get(isbn) || {
        id: isbn,
        isbn,
        title: "Favorite book",
        author: "Unknown author",
        coverUrl: getCoverUrl(isbn),
      }
    );
  });

  return {
    ...profile,
    favoriteBooks,
  };
}