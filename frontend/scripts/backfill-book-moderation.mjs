import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.LITSHELF_BACKFILL_EMAIL;
const password = process.env.LITSHELF_BACKFILL_PASSWORD;
const limit = Math.min(Math.max(Number(process.argv[2]) || 10, 1), 100);

if (!url || !anonKey || !email || !password) {
  console.error("Set SUPABASE_URL, SUPABASE_ANON_KEY, LITSHELF_BACKFILL_EMAIL, and LITSHELF_BACKFILL_PASSWORD.");
  process.exitCode = 1;
} else {
  const supabase = createClient(url, anonKey);
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw authError;
  const { data: rows, error } = await supabase.from("books").select(
    "id,title,author,isbn,genre,description,language,publisher,publication_year,source,external_id"
  ).not("source", "is", null).order("id").limit(limit);
  if (error) throw error;
  for (let offset = 0; offset < rows.length; offset += 10) {
    const books = rows.slice(offset, offset + 10).map((book) => ({
      bookId: book.id, source: book.source,
      externalId: book.external_id || (book.source === "community" ? `book:${book.id}` : ""),
      title: book.title, authors: book.author ? [book.author] : [], description: book.description || "",
      categories: book.genre ? [book.genre] : [], subjects: [], publisher: book.publisher || "",
      publicationYear: book.publication_year, isbn: book.isbn || "", language: book.language || "",
    })).filter((book) => book.externalId);
    if (!books.length) continue;
    const { data, error: invokeError } = await supabase.functions.invoke("moderate-books", { body: { books } });
    if (invokeError) throw invokeError;
    console.log(`Assessed batch ${offset + 1}-${offset + books.length}:`,
      data.results.map((result) => `${result.source}:${result.externalId}=${result.status}`).join(", "));
  }
  await supabase.auth.signOut();
}
