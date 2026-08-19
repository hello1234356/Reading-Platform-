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

const openLibraryFields =
  "key,title,author_name,isbn,cover_i,first_publish_year,subject,language";

function createOpenLibrarySearchUrl(params) {
  const url = new URL("https://openlibrary.org/search.json");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  url.searchParams.set("fields", openLibraryFields);
  return url;
}

function getChineseOpenLibrarySearchUrls(searchTerm, limit) {
  return [
    createOpenLibrarySearchUrl({ q: searchTerm, lang: "zh", limit }),
    createOpenLibrarySearchUrl({ q: `${searchTerm} language:chi`, limit }),
    createOpenLibrarySearchUrl({ q: `${searchTerm} language:zho`, limit }),
    createOpenLibrarySearchUrl({ title: searchTerm, lang: "zh", limit }),
    createOpenLibrarySearchUrl({ q: searchTerm, limit }),
  ];
}

async function fetchOpenLibrarySearch(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Open Library returned ${response.status}.`);
    }

    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function filterOpenLibraryResults(docs = []) {
  let blockedCount = 0;
  const results = [];

  docs.forEach((result) => {
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

async function searchChineseOpenLibrary(searchTerm, limit) {
  const urls = getChineseOpenLibrarySearchUrls(searchTerm, limit);
  let lastError = null;
  let emptyResult = { results: [], blockedCount: 0 };

  for (const url of urls) {
    try {
      const data = await fetchOpenLibrarySearch(url);
      const filteredResults = filterOpenLibraryResults(data.docs || []);

      if (filteredResults.results.length > 0 || filteredResults.blockedCount > 0) {
        return filteredResults;
      }

      emptyResult = filteredResults;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw new Error("Open Library search is unavailable right now. Please try again in a moment.");
  }

  return emptyResult;
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
