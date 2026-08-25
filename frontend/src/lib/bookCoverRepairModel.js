export function canRepairStoredBookCover(book) {
  const bookId = Number(book?.bookId || book?.id);
  const staleCoverUrl = String(book?.coverUrl || "").trim();
  return Number.isSafeInteger(bookId) &&
    bookId > 0 &&
    Boolean(staleCoverUrl) &&
    ["google_books", "open_library"].includes(book?.source);
}
