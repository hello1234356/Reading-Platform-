import { persistMissingBookMetadataSafely } from "./bookMetadataApi";

const OPEN_LIBRARY_BASE_PATH = "/open-library-api";
const OPEN_LIBRARY_ORIGIN = "https://openlibrary.org";
const OPEN_LIBRARY_SEARCH_FIELDS =
  "key,title,author_name,first_publish_year,cover_i,isbn,edition_key,publisher,subject,language";

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

export function getOpenLibraryIsbnCoverUrl(isbn, size = "L") {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!normalizedIsbn) return "";
  return `https://covers.openlibrary.org/b/isbn/${normalizedIsbn}-${size}.jpg?default=false`;
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
    categories: [],
    subjects: Array.isArray(doc.subject) ? doc.subject : [],
    language: firstValue(doc.language) || "",
    providerMetadata: {
      editionCount: doc.edition_count || null,
      firstPublishYear: doc.first_publish_year || null,
    },
  };
}

function hasCjkText(value) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}

function isLikelyIsbnQuery(value) {
  const normalizedValue = normalizeIsbn(value);
  return normalizedValue.length === 10 || normalizedValue.length === 13;
}

function getOpenLibrarySearchParam(query) {
  if (isLikelyIsbnQuery(query)) return "isbn";
  return hasCjkText(query) && Array.from(query).length < 3 ? "title" : "q";
}

function parseResponseBody(body) {
  if (!body) return null;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function buildOpenLibrarySearchUrl(query, limit, baseUrl = OPEN_LIBRARY_BASE_PATH) {
  const url = baseUrl.startsWith("http")
    ? new URL(`${baseUrl}/search.json`)
    : new URL(`${baseUrl}/search.json`, window.location.origin);
  url.searchParams.set(getOpenLibrarySearchParam(query), query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", OPEN_LIBRARY_SEARCH_FIELDS);

  return url;
}

async function fetchOpenLibrarySearch(url) {
  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    const wrappedError = new Error("Open Library search is unavailable right now.");
    wrappedError.url = url.toString();
    wrappedError.cause = error;
    throw wrappedError;
  }

  if (!response.ok) {
    const body = parseResponseBody(await response.text());
    const error = new Error("Open Library search is unavailable right now.");
    error.status = response.status;
    error.url = url.toString();
    error.body = body;
    throw error;
  }

  return response.json();
}

async function fetchOpenLibrarySearchWithFallback(primaryUrl, fallbackUrl) {
  try {
    return await fetchOpenLibrarySearch(primaryUrl);
  } catch (primaryError) {
    const shouldTryFallback =
      fallbackUrl &&
      primaryUrl.toString() !== fallbackUrl.toString();

    if (!shouldTryFallback) {
      throw primaryError;
    }

    try {
      return await fetchOpenLibrarySearch(fallbackUrl);
    } catch (fallbackError) {
      fallbackError.primaryError = primaryError;
      throw fallbackError;
    }
  }
}

export async function searchOpenLibraryBooks(searchTerm, limit = 20, options = {}) {
  const query = String(searchTerm || "").trim();

  if (!query) {
    throw new Error("Enter a Chinese title, author, or ISBN to search.");
  }

  const primaryUrl = buildOpenLibrarySearchUrl(query, limit);
  const fallbackUrl = buildOpenLibrarySearchUrl(
    query,
    limit,
    OPEN_LIBRARY_ORIGIN,
  );

  try {
    const data = await fetchOpenLibrarySearchWithFallback(
      primaryUrl,
      fallbackUrl,
    );
    const books = (data.docs || []).map(mapOpenLibraryDoc);
    if (options.debug ?? Boolean(import.meta.env?.DEV)) {
      console.debug("[book-search] OPEN LIBRARY ACTUAL RESPONSE", {
        docCount: Array.isArray(data.docs) ? data.docs.length : 0,
        titles: books.slice(0, 10).map((book) => ({ title: book.title, author: book.author })),
      });
    }
    return { results: books, blockedCount: 0 };
  } catch (error) {
    console.error("Open Library search failed.", {
      status: error.status,
      url: error.url,
      body: error.body,
    });
    throw error;
  }
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
    const detailPath = `${book.openLibraryKey}.json`;
    const detailUrl = new URL(
      `${OPEN_LIBRARY_BASE_PATH}${detailPath}`,
      window.location.origin,
    );
    const fallbackDetailUrl = new URL(
      `${OPEN_LIBRARY_ORIGIN}${detailPath}`,
    );
    let response;

    try {
      response = await fetch(detailUrl);
    } catch {
      response = await fetch(fallbackDetailUrl);
    }

    if (!response.ok) {
      response = await fetch(fallbackDetailUrl);

      if (!response.ok) {
        throw new Error("Open Library could not load this book.");
      }
    }

    const data = await response.json();
    const coverId = firstValue(data.covers);

    const resolvedDetails = {
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
    await persistMissingBookMetadataSafely(book, {
      ...resolvedDetails,
      description: normalizeDescription(data.description),
      publisher: firstValue(data.publishers) || book?.publisher || "",
      genre: firstValue(data.subjects) || book?.genre || "",
      firstPublished: data.first_publish_date?.slice(0, 4) || book?.firstPublished,
    });
    return resolvedDetails;
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
