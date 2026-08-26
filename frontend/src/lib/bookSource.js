const KNOWN_BOOK_SOURCES = new Set([
  "google_books",
  "open_library",
  "isbn_work",
  "community",
]);

export function normalizeStoredBookSource(value) {
  const source = String(value || "").trim().toLowerCase();
  return KNOWN_BOOK_SOURCES.has(source) ? source : "legacy_catalog";
}

export function getBookSourceLabel(book) {
  if (book?.source === "community") return "LitShelf";
  if (book?.source === "open_library") return "Open Library";
  if (book?.source === "google_books") return "Google Books";
  if (book?.source === "isbn_work") return "ISBN.work";
  return "Catalog record";
}
