import { requireSupabase } from "./supabase";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function escapeLikePattern(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function mapCatalogBook(row) {
  const source = row.source || "community";
  const externalId = row.external_id || "";

  return {
    source,
    bookId: row.id,
    externalId,
    googleBooksId: source === "google_books" ? externalId : "",
    openLibraryKey: source === "open_library" ? externalId : "",
    editionKey: "",
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

function scoreCatalogBook(book, searchTerm) {
  const query = normalizeSearchText(searchTerm);
  const title = normalizeSearchText(book.title);
  const author = normalizeSearchText(book.author);
  const isbn = normalizeIsbn(searchTerm);
  const queryTokens = query.split(" ").filter(Boolean);

  if (isbn && isbn === normalizeIsbn(book.isbn)) return 1000;
  if (query && title === query) return 900;
  if (query && author === query) return 750;
  if (query && title.startsWith(`${query} `)) return 700;

  const titleMatches = queryTokens.filter((token) => title.includes(token)).length;
  const combinedText = `${title} ${author}`;
  const combinedMatches = queryTokens.filter((token) => combinedText.includes(token)).length;

  if (queryTokens.length > 0 && titleMatches === queryTokens.length) return 650;
  if (queryTokens.length > 0 && combinedMatches === queryTokens.length) return 550;
  if (queryTokens.length > 0 && combinedMatches >= Math.ceil(queryTokens.length * 0.6)) {
    return 300 + combinedMatches;
  }

  return combinedMatches ? 100 + combinedMatches : 0;
}

export function areCatalogResultsSufficient(results, searchTerm, limit = 20) {
  if (!results.length) return false;

  const normalizedIsbn = normalizeIsbn(searchTerm);
  if (normalizedIsbn && results.some((book) => normalizeIsbn(book.isbn) === normalizedIsbn)) {
    return true;
  }

  const scoredResults = results.map((book) => scoreCatalogBook(book, searchTerm));
  const hasExactStableTitle = results.some((book, index) =>
    scoredResults[index] >= 900 && Boolean(book.isbn || book.externalId),
  );
  if (hasExactStableTitle) return true;

  const strongCount = scoredResults.filter((score) => score >= 550).length;
  const usefulCount = scoredResults.filter((score) => score >= 300).length;
  const desiredCount = Math.min(Math.max(5, Math.ceil(limit / 2)), limit);

  return strongCount >= 3 && usefulCount >= desiredCount;
}

export function normalizeCommunityBookIsbn(isbn) {
  return normalizeIsbn(isbn);
}

async function searchBooksTable(searchTerm, limit, { communityOnly = false } = {}) {
  const query = String(searchTerm || "").trim();
  if (!query) return [];

  const normalizedText = normalizeSearchText(query);
  const queryParts = [normalizedText]
    .concat(normalizedText.split(" ").filter((token) => token.length >= 2))
    .filter(Boolean)
    .slice(0, 6);
  const filters = [];

  queryParts.forEach((part) => {
    const pattern = `%${escapeLikePattern(part)}%`;
    filters.push(`title.ilike.${pattern}`, `author.ilike.${pattern}`);
  });

  const normalizedIsbn = normalizeIsbn(query);
  if (normalizedIsbn) {
    filters.push(`isbn.eq.${normalizedIsbn}`, `isbn.ilike.%${normalizedIsbn}%`);
  }

  const supabase = requireSupabase();
  let request = supabase
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
      publication_year,
      source,
      external_id,
      created_at
    `)
    .or(filters.join(","))
    .limit(Math.max(10, Math.min(Number(limit) * 3 || 60, 60)));

  if (communityOnly) request = request.eq("source", "community");

  const { data, error } = await request;
  if (error) throw error;

  return (data || [])
    .map(mapCatalogBook)
    .map((book) => ({ book, score: scoreCatalogBook(book, query) }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || 20, 50)))
    .map(({ book }) => book);
}

export async function searchCatalogBooks(searchTerm, limit = 20) {
  const results = await searchBooksTable(searchTerm, limit);
  return {
    results,
    blockedCount: 0,
    sufficient: areCatalogResultsSufficient(results, searchTerm, limit),
  };
}

export async function searchCommunityBooks(searchTerm, limit = 20) {
  const query = String(searchTerm || "").trim();

  if (!query) {
    return { results: [], blockedCount: 0 };
  }

  const results = await searchBooksTable(query, limit, { communityOnly: true });

  return {
    results,
    blockedCount: 0,
  };
}
