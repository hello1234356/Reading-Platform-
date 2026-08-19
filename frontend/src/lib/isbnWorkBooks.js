import { isBlockedGoogleBooksCategoryText } from "./googleBooks";

const ISBN_WORK_BASE_PATH = "/isbn-work-api/openApi";

function normalizeIsbn(isbn) {
  return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function parsePictures(pictures) {
  if (Array.isArray(pictures)) return pictures;

  try {
    const parsedPictures = JSON.parse(String(pictures || "[]"));
    return Array.isArray(parsedPictures) ? parsedPictures : [];
  } catch {
    return [];
  }
}

function getRecordsFromResponse(data) {
  if (Array.isArray(data?.data?.records)) return data.data.records;
  if (Array.isArray(data?.data?.list)) return data.data.list;
  if (Array.isArray(data?.data?.rows)) return data.data.rows;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.data?.isbn || data?.data?.bookName) return [data.data];
  return [];
}

function mapIsbnWorkBook(record) {
  const isbn = normalizeIsbn(record.isbn || record.isbn13 || record.ISBN);
  const pictures = parsePictures(record.pictures || record.picture || record.cover);

  return {
    source: "isbn_work",
    isbn,
    title: record.bookName || record.title || "Untitled",
    author: record.author || "Unknown author",
    firstPublished: record.pressDate || record.pubdate || null,
    coverUrl: pictures[0] || "",
    description: record.bookDesc || record.summary || record.description || "",
    publisher: record.press || record.publisher || "",
    genre: record.clcName || record.category || "",
    language: record.language || "chi",
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

export function isLikelyIsbn(searchTerm) {
  const normalizedSearchTerm = normalizeIsbn(searchTerm);
  return normalizedSearchTerm.length === 10 || normalizedSearchTerm.length === 13;
}

function getAppKey() {
  return import.meta.env.VITE_ISBN_WORK_APP_KEY?.trim() || "";
}

async function fetchIsbnWork(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ISBN.work returned ${response.status}.`);
  }

  const data = await response.json();

  if (data?.success === false || (typeof data?.code === "number" && data.code !== 0)) {
    throw new Error(data?.msg || data?.message || "ISBN.work could not find matching books.");
  }

  return data;
}

async function invokeIsbnWorkBooks({ action, query, isbn, limit }) {
  const appKey = getAppKey();

  if (!appKey) {
    throw new Error(
      "Add VITE_ISBN_WORK_APP_KEY to frontend/.env.local, then restart Vite.",
    );
  }

  if (action === "isbn") {
    const normalizedIsbn = normalizeIsbn(isbn || query);

    if (!normalizedIsbn) {
      throw new Error("Enter an ISBN to look up this book.");
    }

    const url = new URL(
      `${ISBN_WORK_BASE_PATH}/getInfoByIsbn`,
      window.location.origin,
    );
    url.searchParams.set("isbn", normalizedIsbn);
    url.searchParams.set("appKey", appKey);
    return fetchIsbnWork(url);
  }

  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    throw new Error("Enter a Chinese title to search.");
  }

  const url = new URL(
    `${ISBN_WORK_BASE_PATH}/book/page`,
    window.location.origin,
  );
  url.searchParams.set("bookName", normalizedQuery);
  url.searchParams.set("current", "1");
  url.searchParams.set("appKey", appKey);
  const data = await fetchIsbnWork(url);
  const records = getRecordsFromResponse(data);

  if (records.length > limit) {
    return {
      ...data,
      data: records.slice(0, limit),
    };
  }

  return data;
}

export async function searchIsbnWorkBooks(searchTerm, limit = 20) {
  const action = isLikelyIsbn(searchTerm) ? "isbn" : "search";
  const data = await invokeIsbnWorkBooks({
    action,
    query: searchTerm,
    isbn: searchTerm,
    limit,
  });

  const books = getRecordsFromResponse(data).map(mapIsbnWorkBook);
  return filterBlockedBooks(books);
}

export async function getIsbnWorkBookDetails(book) {
  if (!book?.isbn) return book;

  const data = await invokeIsbnWorkBooks({
    action: "isbn",
    isbn: book.isbn,
  });
  const [details] = getRecordsFromResponse(data).map(mapIsbnWorkBook);

  return {
    ...book,
    ...details,
    title: details?.title || book.title,
    author: details?.author || book.author,
    coverUrl: details?.coverUrl || book.coverUrl || "",
    description:
      details?.description ||
      book.description ||
      "ISBN.work does not have an official description for this edition yet.",
  };
}
