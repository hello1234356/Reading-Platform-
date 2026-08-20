import { isBlockedGoogleBooksCategoryText } from "./googleBooks";

const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_BASE_URL = "https://openlibrary.org";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDescription(description) {
  if (!description) return "";
  if (typeof description === "string") return description.trim();
  if (typeof description?.value === "string") return description.value.trim();
  return "";
}

function getOpenLibraryCoverUrl(book, size = "L") {
  if (book.cover_i) {
    return `https://covers.openlibrary.org/b/id/${book.cover_i}-${size}.jpg?default=false`;
  }

  const isbn = normalizeIsbn(firstValue(book.isbn));
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false`;
  }

  const editionKey = firstValue(book.edition_key);
  if (editionKey) {
    return `https://covers.openlibrary.org/b/olid/${editionKey}-${size}.jpg?default=false`;
  }

  return "";
}

function mapOpenLibraryDoc(doc) {
  const isbn = normalizeIsbn(firstValue(doc.isbn));
  const openLibraryKey = doc.key || "";
  const editionKey = firstValue(doc.edition_key) || "";

  return {
    source: "open_library",
    openLibraryKey,
    editionKey,
    googleBooksId: "",
    isbn,
    title: doc.title || "Untitled",
    author: doc.author_name?.join(", ") || "Unknown author",
    firstPublished: doc.first_publish_year || null,
    coverUrl: getOpenLibraryCoverUrl(doc),
    description: "",
    publisher: firstValue(doc.publisher) || "",
    genre: firstValue(doc.subject) || "",
    language: "chi",
  };
}

function filterBlockedBooks(books) {
  let blockedCount = 0;
  const results = [];

  books.forEach((book) => {
    const categoryText = [
      book.title,
      book.author,
      book.publisher,
      book.genre,
      book.description,
    ].join(" ");

    if (isBlockedGoogleBooksCategoryText(categoryText)) blockedCount += 1;
    else results.push(book);
  });

  return { results, blockedCount };
}

export async function searchOpenLibraryBooks(searchTerm, limit = 20) {
  const query = String(searchTerm || "").trim();

  if (!query) {
    throw new Error("Enter a Chinese title, author, or ISBN to search.");
  }

  const url = new URL(OPEN_LIBRARY_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set(
    "fields",
    "key,title,author_name,first_publish_year,cover_i,isbn,edition_key,publisher,subject",
  );

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Open Library search is unavailable right now.");
  }

  const data = await response.json();
  const books = (data.docs || []).map(mapOpenLibraryDoc);
  return filterBlockedBooks(books);
}

export async function getOpenLibraryBookDetails(book) {
  const baseDetails = {
    ...book,
    coverUrl: book?.coverUrl || "",
    description: book?.description || "",
  };

  if (!book?.openLibraryKey) {
    return {
      ...baseDetails,
      description:
        baseDetails.description ||
        "Open Library does not have an official description for this edition yet.",
    };
  }

  try {
    const response = await fetch(`${OPEN_LIBRARY_BASE_URL}${book.openLibraryKey}.json`);

    if (!response.ok) {
      throw new Error("Open Library could not load this book.");
    }

    const data = await response.json();
    const coverId = firstValue(data.covers);

    return {
      ...baseDetails,
      title: data.title || baseDetails.title,
      coverUrl:
        baseDetails.coverUrl ||
        (coverId
          ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`
          : ""),
      description:
        normalizeDescription(data.description) ||
        baseDetails.description ||
        "Open Library does not have an official description for this edition yet.",
    };
  } catch (error) {
    return {
      ...baseDetails,
      error: error.message || "Open Library could not load this book.",
      description:
        baseDetails.description ||
        "Open Library does not have an official description for this edition yet.",
    };
  }
}
