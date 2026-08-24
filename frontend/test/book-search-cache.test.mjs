import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clearBookSearchMemoryCache,
  normalizeBookSearchQuery,
  searchWithSharedCache,
} from "../src/lib/bookSearchCache.js";
import { searchGoogleWithQuotaFallback } from "../src/lib/bookSearchPolicy.js";
import { filterRelevantCatalogBooks } from "../src/lib/communityBooks.js";

function createSharedStore() {
  const rows = new Map();

  return {
    rows,
    read: async (provider, query, limit) => {
      const row = rows.get(`${provider}:${normalizeBookSearchQuery(query)}`);
      if (!row || row.expiresAt <= Date.now()) return null;
      return {
        results: row.payload.results.slice(0, limit),
        blockedCount: row.payload.blockedCount || 0,
      };
    },
    write: async (provider, query, payload) => {
      rows.set(`${provider}:${normalizeBookSearchQuery(query)}`, {
        payload,
        expiresAt: Date.now() + 60_000,
      });
    },
  };
}

const googleResult = {
  source: "google_books",
  googleBooksId: "google-1",
  isbn: "9780000000001",
  title: "Cached English Book",
  author: "An Author",
};

const openLibraryResult = {
  source: "open_library",
  openLibraryKey: "/works/OL1W",
  editionKey: "OL1M",
  isbn: "9780000000002",
  title: "Cached Open Library Book",
  author: "Another Author",
};

test("first English search calls Google and writes the shared cache", async () => {
  clearBookSearchMemoryCache();
  const store = createSharedStore();
  let googleCalls = 0;

  const response = await searchWithSharedCache({
    provider: "google_books",
    searchTerm: "  Cached English Book  ",
    readCache: store.read,
    writeCache: store.write,
    fetchResults: async () => {
      googleCalls += 1;
      return { results: [googleResult], blockedCount: 0 };
    },
  });

  assert.equal(googleCalls, 1);
  assert.equal(response.cacheHit, false);
  assert.equal(store.rows.size, 1);
});

test("same English search in a new session uses shared cache with zero Google calls", async () => {
  clearBookSearchMemoryCache();
  const store = createSharedStore();
  await store.write("google_books", "cached english book", {
    results: [googleResult],
    blockedCount: 0,
  });
  let googleCalls = 0;

  const response = await searchWithSharedCache({
    provider: "google_books",
    searchTerm: "Cached English Book",
    readCache: store.read,
    writeCache: store.write,
    fetchResults: async () => {
      googleCalls += 1;
      return { results: [], blockedCount: 0 };
    },
  });

  assert.equal(googleCalls, 0);
  assert.equal(response.cacheHit, true);
  assert.deepEqual(response.results, [googleResult]);
});

test("Google quota errors fall back to Open Library and repeated fallback searches hit cache", async () => {
  clearBookSearchMemoryCache();
  const store = createSharedStore();
  let googleCalls = 0;
  let openLibraryCalls = 0;

  const runSearch = () => searchGoogleWithQuotaFallback({
    searchGoogle: async () => {
      googleCalls += 1;
      const error = new Error("quota");
      error.isQuotaExceeded = true;
      throw error;
    },
    searchOpenLibrary: () => searchWithSharedCache({
      provider: "open_library",
      searchTerm: "Quota Book",
      readCache: store.read,
      writeCache: store.write,
      fetchResults: async () => {
        openLibraryCalls += 1;
        return { results: [openLibraryResult], blockedCount: 0 };
      },
    }),
    isQuotaError: (error) => error.isQuotaExceeded,
  });

  const first = await runSearch();
  clearBookSearchMemoryCache();
  const second = await runSearch();

  assert.deepEqual(first.results, [openLibraryResult]);
  assert.deepEqual(second.results, [openLibraryResult]);
  assert.equal(googleCalls, 2);
  assert.equal(openLibraryCalls, 1);
  assert.equal(second.cacheHit, true);
});

test("non-quota Google errors do not switch providers", async () => {
  let openLibraryCalls = 0;
  const googleError = new Error("invalid API key");

  await assert.rejects(
    searchGoogleWithQuotaFallback({
      searchGoogle: async () => { throw googleError; },
      searchOpenLibrary: async () => {
        openLibraryCalls += 1;
        return { results: [openLibraryResult] };
      },
      isQuotaError: (error) => Boolean(error.isQuotaExceeded),
    }),
    googleError,
  );

  assert.equal(openLibraryCalls, 0);
});

test("parallel identical Open Library searches share one provider request", async () => {
  clearBookSearchMemoryCache();
  const store = createSharedStore();
  let openLibraryCalls = 0;
  const search = () => searchWithSharedCache({
    provider: "open_library",
    searchTerm: "Parallel Book",
    readCache: store.read,
    writeCache: store.write,
    fetchResults: async () => {
      openLibraryCalls += 1;
      await Promise.resolve();
      return { results: [openLibraryResult], blockedCount: 0 };
    },
  });

  const [first, second] = await Promise.all([search(), search()]);
  assert.equal(openLibraryCalls, 1);
  assert.deepEqual(first.results, second.results);
});

test("Chinese provider search uses only Open Library and its cache", async () => {
  clearBookSearchMemoryCache();
  const store = createSharedStore();
  let openLibraryCalls = 0;
  const searchChinese = () => searchWithSharedCache({
    provider: "open_library",
    searchTerm: "活着",
    readCache: store.read,
    writeCache: store.write,
    fetchResults: async () => {
      openLibraryCalls += 1;
      return { results: [openLibraryResult], blockedCount: 0 };
    },
  });

  await searchChinese();
  clearBookSearchMemoryCache();
  const cached = await searchChinese();

  assert.equal(openLibraryCalls, 1);
  assert.equal(cached.cacheHit, true);
});

test("expired shared cache entries query the external provider again", async () => {
  clearBookSearchMemoryCache();
  const store = createSharedStore();
  store.rows.set("google_books:expired book", {
    payload: { results: [googleResult], blockedCount: 0 },
    expiresAt: Date.now() - 1,
  });
  let googleCalls = 0;

  const response = await searchWithSharedCache({
    provider: "google_books",
    searchTerm: "Expired Book",
    readCache: store.read,
    writeCache: store.write,
    fetchResults: async () => {
      googleCalls += 1;
      return { results: [googleResult], blockedCount: 0 };
    },
  });

  assert.equal(googleCalls, 1);
  assert.equal(response.cacheHit, false);
});

test("migration validates authentication, shape, result count, and payload size", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608230001_book_search_cache.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /jsonb_typeof\(p_result_json -> 'results'\) <> 'array'/);
  assert.match(migration, /result_count > 20/);
  assert.match(migration, /pg_column_size\(p_result_json\) > 200000/);
  assert.match(migration, /revoke execute[\s\S]+from public, anon/);
});

test("local catalog filtering hides weak database matches", () => {
  const books = [
    { title: "Harry Potter and the Goblet of Fire", author: "J. K. Rowling" },
    { title: "The Art of Pottering Around", author: "Someone Else" },
    { title: "A History of Magic", author: "Unrelated Author" },
  ];

  assert.deepEqual(
    filterRelevantCatalogBooks(books, "Harry Potter"),
    [books[0]],
  );
  assert.deepEqual(filterRelevantCatalogBooks(books, "Potter"), []);
});

test("metadata RPC is authenticated and only fills missing fields", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608240001_fill_missing_book_metadata.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /when nullif\(btrim\(coalesce\(description, ''\)\), ''\) is null/);
  assert.match(migration, /when nullif\(btrim\(coalesce\(cover_url, ''\)\), ''\) is null/);
  assert.match(migration, /coalesce\(publication_year, p_publication_year\)/);
  assert.match(migration, /Book provider identity does not match/);
});
