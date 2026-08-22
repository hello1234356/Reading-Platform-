import { requireSupabase } from "./supabase";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function escapeLikePattern(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function mapCommunityBook(row) {
  return {
    source: "community",
    bookId: row.id,
    isbn: normalizeIsbn(row.isbn),
    title: row.title || "Untitled",
    author: row.author || "Unknown author",
    firstPublished: row.publication_year || null,
    coverUrl: row.cover_url || "",
    description: row.description || "",
    publisher: row.publisher || "",
    genre: row.genre || "",
    language: row.language || "",
  };
}

export function normalizeCommunityBookIsbn(isbn) {
  return normalizeIsbn(isbn);
}

export async function searchCommunityBooks(searchTerm, limit = 20) {
  const query = String(searchTerm || "").trim();

  if (!query) {
    return { results: [], blockedCount: 0 };
  }

  const supabase = requireSupabase();
  const pattern = `%${escapeLikePattern(query).replace(/[(),]/g, " ")}%`;
  const normalizedIsbn = normalizeIsbn(query);
  const filters = [
    `title.ilike.${pattern}`,
    `author.ilike.${pattern}`,
    `isbn.ilike.${pattern}`,
  ];

  if (normalizedIsbn) {
    filters.push(`isbn.eq.${normalizedIsbn}`);
  }

  const { data, error } = await supabase
    .from("books")
    .select(`
      id,
      title,
      author,
      isbn,
      genre,
      description,
      cover_url,
      language,
      publisher,
      publication_year
    `)
    .eq("source", "community")
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 20, 50)));

  if (error) {
    throw error;
  }

  return {
    results: (data || []).map(mapCommunityBook),
    blockedCount: 0,
  };
}
