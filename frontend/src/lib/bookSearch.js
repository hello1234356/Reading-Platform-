import {
  filterGoogleBooksResults,
  isBlockedGoogleBooksCategoryText,
  mapGoogleBooksResult,
  searchGoogleBooks,
} from "./googleBooks";

export function isChineseBookSearch(searchTerm) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(
    String(searchTerm || ""),
  );
}

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function mapOpenLibraryResult(result) {
  const isbn = result.isbn?.[0] || "";
  return {
    source: "open_library",
    openLibraryKey: result.key || "",
    isbn: normalizeIsbn(isbn),
    title: result.title || "Untitled",
    author: result.author_name?.join(", ") || "Unknown author",
    firstPublished: result.first_publish_year || null,
    coverUrl: result.cover_i
      ? `https://covers.openlibrary.org/b/id/${result.cover_i}-L.jpg`
      : isbn
        ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`
        : "",
  };
}

async function searchChineseOpenLibrary(searchTerm, limit) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", searchTerm);
  url.searchParams.set("language", "chi");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set(
    "fields",
    "key,title,author_name,isbn,cover_i,first_publish_year,subject,language",
  );

  const response = await fetch(url);
  if (!response.ok) throw new Error("Open Library search is unavailable right now.");
  const data = await response.json();
  let blockedCount = 0;
  const results = [];

  (data.docs || []).forEach((result) => {
    const categoryText = [
      result.title,
      ...(result.author_name || []),
      ...(result.subject || []),
    ].join(" ");
    if (isBlockedGoogleBooksCategoryText(categoryText)) blockedCount += 1;
    else results.push(mapOpenLibraryResult(result));
  });

  return { results, blockedCount };
}

export async function searchBooksByQueryLanguage(searchTerm, limit = 20) {
  if (isChineseBookSearch(searchTerm)) {
    return searchChineseOpenLibrary(searchTerm, limit);
  }

  const googleResults = await searchGoogleBooks(searchTerm, limit);
  const { allowedResults, blockedCount } =
    filterGoogleBooksResults(googleResults);
  return {
    results: allowedResults.map((result) => ({
      ...mapGoogleBooksResult(result),
      source: "google_books",
    })),
    blockedCount,
  };
}
