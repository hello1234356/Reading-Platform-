import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  getLegacyIsbnBookDetails,
  resolveIsbnBookFromExistingProviders,
} from "../src/lib/isbnBookProviders.js";
import { BOOK_DETAIL_LOAD_ERROR, loadBookDetailsSafely } from "../src/lib/bookDetails.js";

const frontendRoot = new URL("../src/", import.meta.url);

async function readSourceTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(entries.map(async (entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) return readSourceTree(url);
    return /\.(?:js|jsx)$/.test(entry.name) ? readFile(url, "utf8") : "";
  }));
  return sources.flat().join("\n");
}

test("English, Chinese, and ISBN search routes have no ISBN.work runtime call", async () => {
  const search = await readFile(new URL("lib/bookSearch.js", frontendRoot), "utf8");
  assert.doesNotMatch(search, /isbn-work-books|searchIsbnWorkBooks|ISBN_WORK_APP_KEY/);
  assert.match(search, /searchNonChineseExternalBooks/);
  assert.match(search, /searchChineseBooks[\s\S]*searchOpenLibraryProvider/);
  assert.match(search, /isLikelyIsbn\(searchTerm\)[\s\S]*searchOpenLibraryProvider/);
});

test("complete legacy ISBN.work records use stored metadata without a provider request", async () => {
  const stored = {
    source: "isbn_work", externalId: "9787500000000", bookId: 42,
    isbn: "9787500000000", title: "Stored title", author: "Stored author",
    description: "Stored description", coverUrl: "https://example.test/cover.jpg",
    publisher: "Stored publisher", firstPublished: 2020, genre: "Fiction", language: "chi",
  };
  let providerCalls = 0;
  const details = await getLegacyIsbnBookDetails(stored, {
    searchOpenLibrary: async () => { providerCalls += 1; throw new Error("not expected"); },
  });
  assert.equal(providerCalls, 0);
  assert.deepEqual(details, stored);
});

test("missing legacy metadata can be enriched by Open Library without changing identity", async () => {
  const stored = {
    source: "isbn_work", externalId: "9787500000000", bookId: 42,
    isbn: "9787500000000", title: "Stored title", author: "Stored author",
    description: "", coverUrl: "", publisher: "", firstPublished: null,
  };
  const details = await getLegacyIsbnBookDetails(stored, {
    searchOpenLibrary: async () => ({ results: [{
      source: "open_library", openLibraryKey: "/works/OL1W",
      isbn: stored.isbn, title: "Provider title", author: "Provider author",
    }] }),
    loadOpenLibraryDetails: async () => ({
      description: "Provider description", coverUrl: "https://example.test/ol.jpg",
      publisher: "Provider publisher", firstPublished: 1999,
      genre: "Novel", language: "chi",
    }),
  });
  assert.equal(details.source, "isbn_work");
  assert.equal(details.externalId, stored.externalId);
  assert.equal(details.bookId, stored.bookId);
  assert.equal(details.title, "Stored title");
  assert.equal(details.author, "Stored author");
  assert.equal(details.description, "Provider description");
  assert.equal(details.publisher, "Provider publisher");
});

test("unidentified ISBN-only resolution prefers Open Library and falls back to Google", async () => {
  let googleCalls = 0;
  const openLibrary = await resolveIsbnBookFromExistingProviders("9787500000000", {
    searchOpenLibrary: async () => ({ results: [{
      source: "open_library", openLibraryKey: "/works/OL1W",
      isbn: "9787500000000", title: "Resolved OL", author: "Author",
    }] }),
    searchGoogle: async () => { googleCalls += 1; return []; },
  });
  assert.equal(openLibrary.source, "open_library");
  assert.equal(openLibrary.externalId, "/works/OL1W");
  assert.equal(googleCalls, 0);

  let googleQuery = "";
  const google = await resolveIsbnBookFromExistingProviders("9787500000000", {
    searchOpenLibrary: async () => ({ results: [] }),
    searchGoogle: async (query) => {
      googleQuery = query;
      return [{ id: "google-volume", volumeInfo: {
        title: "Resolved Google", authors: ["Author"],
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9787500000000" }],
      } }];
    },
  });
  assert.equal(googleQuery, "isbn:9787500000000");
  assert.equal(google.source, "google_books");
  assert.equal(google.googleBooksId, "google-volume");
  assert.equal(google.externalId, "google-volume");
});

test("failed detail enrichment preserves stored metadata and returns a friendly error", async () => {
  const stored = { source: "open_library", externalId: "/works/OL1W",
    title: "Stored title", author: "Stored author", description: "Stored description" };
  const result = await loadBookDetailsSafely(stored, async () => {
    throw new Error("provider unavailable");
  });
  assert.deepEqual(result.details, stored);
  assert.equal(result.error, BOOK_DETAIL_LOAD_ERROR);
});

test("frontend has no ISBN.work Edge invocation or credential requirement", async () => {
  const frontendSource = await readSourceTree(frontendRoot);
  assert.doesNotMatch(frontendSource, /functions\.invoke\(["']isbn-work-books["']/);
  assert.doesNotMatch(frontendSource, /ISBN_WORK_APP_KEY|VITE_ISBN_WORK_APP_KEY/);

  const [library, discover, home, profile] = await Promise.all([
    readFile(new URL("lib/libraryApi.js", frontendRoot), "utf8"),
    readFile(new URL("pages/Discover.jsx", frontendRoot), "utf8"),
    readFile(new URL("pages/Home.jsx", frontendRoot), "utf8"),
    readFile(new URL("pages/Profile.jsx", frontendRoot), "utf8"),
  ]);
  assert.match(library, /resolveIsbnBookFromExistingProviders/);
  assert.doesNotMatch(library, /isbnWorkBooks|ISBN\.work/);
  for (const page of [discover, home, profile]) {
    assert.match(page, /finally\s*\{\s*setBookDetailLoading\(false\)/);
  }
});
