export const READING_LIST_STORAGE_KEY = "litshelf-reading-list-v1";

export function getReadingList() {
  try {
    const savedBooks = JSON.parse(localStorage.getItem(READING_LIST_STORAGE_KEY));
    return Array.isArray(savedBooks) ? savedBooks : [];
  } catch {
    return [];
  }
}

export function saveBookToReadingList(book) {
  const currentBooks = getReadingList();

  if (
    currentBooks.some(
      (savedBook) =>
        (book.isbn && savedBook.isbn === book.isbn) ||
        savedBook.openLibraryKey === book.openLibraryKey,
    )
  ) {
    return currentBooks;
  }

  const nextBooks = [book, ...currentBooks];
  localStorage.setItem(READING_LIST_STORAGE_KEY, JSON.stringify(nextBooks));
  return nextBooks;
}
