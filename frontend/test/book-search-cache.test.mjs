import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clearBookSearchMemoryCache,
  normalizeBookSearchQuery,
  searchWithSharedCache,
} from "../src/lib/bookSearchCache.js";
import { searchGoogleWithQuotaFallback } from "../src/lib/bookSearchPolicy.js";
import { searchCatalogAndExternal } from "../src/lib/bookSearchPolicy.js";
import { filterRelevantCatalogBooks, mapCatalogBook } from "../src/lib/communityBooks.js";
import { mergeBookResults } from "../src/lib/bookSearchMerge.js";
import { getBookSourceLabel } from "../src/lib/bookSource.js";
import {
  searchGoogleBooks,
  shouldFallbackFromGoogleBooks,
} from "../src/lib/googleBooks.js";
import { rankBookSearchResults } from "../src/lib/bookSearchRelevance.js";

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

test("cache bypass calls the provider despite a valid shared cache hit", async () => {
  clearBookSearchMemoryCache();
  const store = createSharedStore();
  await store.write("google_books", "harry potter", {
    results: [{ ...googleResult, title: "Stale irrelevant cached result" }], blockedCount: 0,
  });
  let providerCalls = 0;
  const response = await searchWithSharedCache({
    provider: "google_books", searchTerm: "harry potter",
    readCache: store.read, writeCache: store.write, bypassProviderCache: true,
    fetchResults: async () => {
      providerCalls += 1;
      return { results: [{ ...googleResult, title: "Harry Potter and the Philosopher's Stone" }] };
    },
  });
  assert.equal(providerCalls, 1);
  assert.equal(response.cacheHit, false);
  assert.equal(response.actualProviderFetchPerformed, true);
  assert.equal(response.results[0].title, "Harry Potter and the Philosopher's Stone");
});

test("failed provider responses are never written as successful cache payloads", async () => {
  clearBookSearchMemoryCache();
  let cacheWrites = 0;
  const providerError = Object.assign(new Error("Google unavailable"), { status: 503 });
  await assert.rejects(searchWithSharedCache({
    provider: "google_books",
    searchTerm: "harry potter",
    readCache: async () => null,
    writeCache: async () => { cacheWrites += 1; },
    fetchResults: async () => { throw providerError; },
  }), providerError);
  assert.equal(cacheWrites, 0);
});

test("missing Google key skips fetch and falls back to Open Library exactly once", async () => {
  let googleFetchCalls = 0;
  let openLibraryCalls = 0;
  const diagnostics = [];
  const response = await searchGoogleWithQuotaFallback({
    searchGoogle: () => searchWithSharedCache({
      provider: "google_books", searchTerm: "harry potter",
      readCache: async () => null, writeCache: async () => null,
      onCacheDiagnostic: (details) => diagnostics.push(details),
      fetchResults: () => searchGoogleBooks("harry potter", 10, {
        apiKey: "", fetchImpl: async () => { googleFetchCalls += 1; }, debug: false,
      }),
    }),
    searchOpenLibrary: async () => {
      openLibraryCalls += 1;
      return { results: [openLibraryResult] };
    },
    isQuotaError: shouldFallbackFromGoogleBooks,
  });
  assert.equal(googleFetchCalls, 0);
  assert.equal(openLibraryCalls, 1);
  assert.equal(diagnostics[0].actualProviderFetchPerformed, false);
  assert.deepEqual(response.results, [openLibraryResult]);
});

test("Google 503 is fallback eligible", async () => {
  let openLibraryCalls = 0;
  const error = Object.assign(new Error("unavailable"), { status: 503 });
  const result = await searchGoogleWithQuotaFallback({
    searchGoogle: async () => { throw error; },
    searchOpenLibrary: async () => { openLibraryCalls += 1; return { results: [openLibraryResult] }; },
    isQuotaError: shouldFallbackFromGoogleBooks,
  });
  assert.equal(openLibraryCalls, 1);
  assert.deepEqual(result.results, [openLibraryResult]);
});

test("Google credential rejection and malformed JSON fall back without hiding English search", async () => {
  for (const response of [
    new Response(JSON.stringify({ error: { message: "API key rejected" } }), {
      status: 403, headers: { "content-type": "application/json" },
    }),
    new Response("<html>proxy error</html>", {
      status: 200, headers: { "content-type": "text/html" },
    }),
  ]) {
    let fallbackCalls = 0;
    const result = await searchGoogleWithQuotaFallback({
      searchGoogle: () => searchGoogleBooks("harry potter", 10, {
        apiKey: "configured", debug: false, fetchImpl: async () => response,
      }),
      searchOpenLibrary: async () => {
        fallbackCalls += 1;
        return { results: [openLibraryResult] };
      },
      isQuotaError: shouldFallbackFromGoogleBooks,
    });
    assert.equal(fallbackCalls, 1);
    assert.deepEqual(result.results, [openLibraryResult]);
  }
});

test("arbitrary programming errors are not silently sent to fallback", async () => {
  let openLibraryCalls = 0;
  const error = new TypeError("bug in result mapper");
  await assert.rejects(searchGoogleWithQuotaFallback({
    searchGoogle: async () => { throw error; },
    searchOpenLibrary: async () => { openLibraryCalls += 1; return { results: [] }; },
    isQuotaError: shouldFallbackFromGoogleBooks,
  }), error);
  assert.equal(openLibraryCalls, 0);
});

test("actual Google response logging occurs only when fetch really executes", async () => {
  const messages = [];
  const originalDebug = console.debug;
  console.debug = (label, details) => messages.push({ label, details });
  try {
    await searchGoogleBooks("provider log fixture", 1, {
      apiKey: "configured", bypassProviderCache: true, debug: true,
      fetchImpl: async () => new Response(JSON.stringify({ items: [{
        id: "logged", volumeInfo: { title: "Actually fetched", authors: ["Author"] },
      }] }), { status: 200 }),
    });
  } finally {
    console.debug = originalDebug;
  }
  const actual = messages.filter(({ label }) => label.includes("GOOGLE ACTUAL RESPONSE"));
  assert.equal(actual.length, 1);
  assert.equal(actual[0].details.itemCount, 1);
});

test("Google search sends the exact historical request with no fetch overrides", async () => {
  const calls = [];
  const results = await searchGoogleBooks("harry potter", 20, {
    apiKey: "test-key",
    debug: false,
    fetchImpl: async (...args) => {
      calls.push(args);
      return new Response(JSON.stringify({ items: [{
        id: "hp-1",
        volumeInfo: { title: "Harry Potter", authors: ["J. K. Rowling"] },
      }] }), { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  const url = new URL(calls[0][0]);
  assert.equal(url.href,
    "https://www.googleapis.com/books/v1/volumes?key=test-key&q=harry+potter&printType=books&langRestrict=en&maxResults=20");
  assert.equal(url.searchParams.has("orderBy"), false);
  assert.equal(results.length, 1);
});

test("catalog sufficiency never suppresses canonical external title results", async () => {
  let externalCalls = 0;
  const weakCatalog = { results: [{ source: "community", externalId: "weak",
    title: "A commentary mentioning Harry Potter", author: "Unknown" }], sufficient: true };
  const canonical = [{ ...googleResult, googleBooksId: "hp-1",
    title: "Harry Potter and the Philosopher's Stone", author: "J. K. Rowling" }];
  const merged = await searchCatalogAndExternal({
    searchCatalog: async () => weakCatalog,
    searchExternal: async () => { externalCalls += 1; return { results: canonical }; },
    mergeResults: (external, catalog) => external.concat(catalog),
  });
  const ranked = rankBookSearchResults("harry potter", merged.results);
  assert.equal(externalCalls, 1);
  assert.equal(ranked[0].title, canonical[0].title);
  assert.ok(ranked.some((book) => book.title === weakCatalog.results[0].title));
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

test("single-word title relevance uses token boundaries", () => {
  const ranked = rankBookSearchResults("art", [
    { title: "Earth Science", author: "A" },
    { title: "The Art Book", author: "B" },
  ]);
  assert.deepEqual(ranked.map((item) => item.title), ["The Art Book"]);
});

test("all catalog and provider candidates are merged before final ranking", async () => {
  const [source, mergeSource] = await Promise.all([
    readFile(new URL("../src/lib/bookSearch.js", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/bookSearchMerge.js", import.meta.url), "utf8"),
  ]);
  assert.match(mergeSource, /Ranking happens only after[\s\S]*return mergedResults;/);
  assert.doesNotMatch(mergeSource, /return mergedResults\.slice\(0, limit\)/);
  assert.match(source, /searchCatalogBooks\(searchTerm, limit\)/);
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    title: `Weak provider result ${index}`, author: "Unknown",
  })).concat([{ title: "Harry Potter and the Philosopher's Stone", author: "J. K. Rowling" }]);
  const ranked = rankBookSearchResults("harry potter", candidates, 20);
  assert.equal(ranked[0].title, "Harry Potter and the Philosopher's Stone");
});

test("live and materialized Pride and Prejudice merge by provider identity", () => {
  const catalog = mapCatalogBook({
    id: 123, source: "open_library", external_id: "/works/OL66554W",
    isbn: "9780141439518", title: "Pride and Prejudice", author: "Jane Austen",
    description: "Stored catalog description.",
  });
  const live = {
    source: "open_library", externalId: "/works/OL66554W",
    openLibraryKey: "/works/OL66554W", isbn: "9780141439518",
    title: "Pride and Prejudice", author: "Jane Austen",
  };
  const merged = mergeBookResults([live], [catalog]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "open_library");
  assert.equal(merged[0].externalId, "/works/OL66554W");
  assert.equal(merged[0].bookId, 123);
  assert.equal(merged[0].description, "Stored catalog description.");
  assert.equal(getBookSourceLabel(merged[0]), "Open Library");
});

test("stored provenance controls labels and missing provenance is not invented as community", () => {
  const openLibrary = mapCatalogBook({ id: 1, source: "open_library",
    external_id: "/works/OL1W", title: "Provider-only catalog book" });
  const google = mapCatalogBook({ id: 2, source: "google_books",
    external_id: "google-2", title: "Cached provider book" });
  const community = mapCatalogBook({ id: 3, source: "community",
    external_id: "book:3", title: "Unique user submission" });
  const unknownLegacy = mapCatalogBook({ id: 4, source: null,
    external_id: null, title: "Old catalog row" });
  assert.equal(getBookSourceLabel(openLibrary), "Open Library");
  assert.equal(getBookSourceLabel(google), "Google Books");
  assert.equal(getBookSourceLabel(community), "LitShelf");
  assert.equal(unknownLegacy.source, "legacy_catalog");
  assert.equal(getBookSourceLabel(unknownLegacy), "Catalog record");
});

test("trusted materialization persists provider provenance and submissions create community", async () => {
  const [integrity, submissions] = await Promise.all([
    readFile(new URL(
      "../../supabase/migrations/202608250012_book_moderation_integrity.sql",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "../../supabase/migrations/202608210002_community_book_moderation_foundation.sql",
      import.meta.url,
    ), "utf8"),
  ]);
  const materialize = integrity.match(
    /create or replace function public\.materialize_approved_book[\s\S]*?\n\$\$;/i,
  )?.[0] || "";
  assert.match(materialize, /p_source,\s+p_external_id,/i);
  assert.match(materialize, /where source = p_source and external_id = p_external_id/i);
  assert.doesNotMatch(materialize, /'community'/i);
  assert.match(submissions, /target_submission\.cover_url,\s+'community',\s+null/i);
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
