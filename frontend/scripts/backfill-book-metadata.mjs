const APPLY_CHANGES = process.argv.includes("--apply");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_BOOKS_API_KEY =
  process.env.GOOGLE_BOOKS_API_KEY || process.env.VITE_GOOGLE_BOOKS_API_KEY;
const REQUEST_DELAY_MS = Math.max(100, Number(process.env.BOOK_BACKFILL_DELAY_MS) || 250);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the metadata backfill.",
  );
}

function normalizeIsbn(value) {
  return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

function normalizeDescription(value) {
  const description = typeof value === "string" ? value : value?.value || "";
  return String(description)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`${url.host} returned ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function mapGoogleVolume(volume) {
  const info = volume?.volumeInfo || {};
  return {
    description: normalizeDescription(info.description),
    cover_url: String(
      info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "",
    ).replace(/^http:/, "https:"),
    publisher: info.publisher || "",
    publication_year: Number.parseInt(info.publishedDate?.slice(0, 4), 10) || null,
    genre: first(info.categories) || "",
  };
}

async function fetchGoogleMetadata(book) {
  if (!GOOGLE_BOOKS_API_KEY) return null;

  const url = book.source === "google_books" && book.external_id
    ? new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(book.external_id)}`)
    : new URL("https://www.googleapis.com/books/v1/volumes");

  if (!(book.source === "google_books" && book.external_id)) {
    const isbn = normalizeIsbn(book.isbn);
    if (!isbn) return null;
    url.searchParams.set("q", `isbn:${isbn}`);
    url.searchParams.set("maxResults", "1");
  }
  url.searchParams.set("key", GOOGLE_BOOKS_API_KEY);
  const data = await fetchJson(url);
  const volume = data.items?.[0] || (data.volumeInfo ? data : null);
  return volume ? mapGoogleVolume(volume) : null;
}

function mapOpenLibraryRecord(data) {
  const coverId = first(data.covers) || data.cover_i;
  return {
    description: normalizeDescription(data.description),
    cover_url: coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`
      : "",
    publisher: first(data.publishers || data.publisher) || "",
    publication_year: Number.parseInt(
      String(data.first_publish_date || data.first_publish_year || "").slice(0, 4),
      10,
    ) || null,
    genre: first(data.subjects || data.subject) || "",
  };
}

async function fetchOpenLibraryMetadata(book) {
  if (book.source === "open_library" && book.external_id) {
    const key = String(book.external_id).startsWith("/")
      ? book.external_id
      : `/works/${book.external_id}`;
    return mapOpenLibraryRecord(
      await fetchJson(new URL(`https://openlibrary.org${key}.json`)),
    );
  }

  const isbn = normalizeIsbn(book.isbn);
  if (!isbn) return null;
  const searchUrl = new URL("https://openlibrary.org/search.json");
  searchUrl.searchParams.set("isbn", isbn);
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set(
    "fields",
    "key,cover_i,publisher,first_publish_year,subject",
  );
  const searchData = await fetchJson(searchUrl);
  const result = searchData.docs?.[0];
  if (!result) return null;

  if (result.key) {
    try {
      const details = await fetchJson(
        new URL(`https://openlibrary.org${result.key}.json`),
      );
      return mapOpenLibraryRecord({ ...result, ...details });
    } catch {
      // Search metadata is still useful when a work detail request fails.
    }
  }

  return mapOpenLibraryRecord(result);
}

async function resolveMetadata(book) {
  if (book.source === "open_library") {
    return fetchOpenLibraryMetadata(book);
  }

  try {
    const googleMetadata = await fetchGoogleMetadata(book);
    if (googleMetadata) return googleMetadata;
  } catch (error) {
    if (error.status !== 429) throw error;
  }

  return fetchOpenLibraryMetadata(book);
}

function missingUpdates(book, metadata) {
  if (!metadata) return {};
  const updates = {};

  for (const field of ["description", "cover_url", "publisher", "genre"]) {
    if (!String(book[field] || "").trim() && String(metadata[field] || "").trim()) {
      updates[field] = metadata[field];
    }
  }

  if (!book.publication_year && metadata.publication_year) {
    updates.publication_year = metadata.publication_year;
  }

  return updates;
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};
const booksUrl = new URL("/rest/v1/books", SUPABASE_URL);
booksUrl.searchParams.set(
  "select",
  "id,title,author,isbn,source,external_id,description,cover_url,publisher,publication_year,genre",
);
const books = await fetchJson(booksUrl, { headers });
const incompleteBooks = books.filter((book) =>
  !String(book.description || "").trim() ||
  !String(book.cover_url || "").trim() ||
  !String(book.publisher || "").trim() ||
  !book.publication_year ||
  !String(book.genre || "").trim(),
);

let updatedCount = 0;
let matchedCount = 0;

for (const book of incompleteBooks) {
  try {
    const metadata = await resolveMetadata(book);
    const updates = missingUpdates(book, metadata);
    const fields = Object.keys(updates);

    if (fields.length === 0) {
      process.stdout.write(`No metadata match: ${book.title}\n`);
    } else {
      matchedCount += 1;
      process.stdout.write(
        `${APPLY_CHANGES ? "Updating" : "Would update"}: ${book.title} (${fields.join(", ")})\n`,
      );

      if (APPLY_CHANGES) {
        const updateUrl = new URL("/rest/v1/books", SUPABASE_URL);
        updateUrl.searchParams.set("id", `eq.${book.id}`);
        await fetchJson(updateUrl, {
          method: "PATCH",
          headers: { ...headers, prefer: "return=representation" },
          body: JSON.stringify(updates),
        });
        updatedCount += 1;
      }
    }
  } catch (error) {
    process.stderr.write(`Failed ${book.title}: ${error.message}\n`);
  }

  await sleep(REQUEST_DELAY_MS);
}

process.stdout.write(
  `${APPLY_CHANGES ? "Updated" : "Dry run matched"} ${APPLY_CHANGES ? updatedCount : matchedCount} of ${incompleteBooks.length} incomplete books.\n`,
);
