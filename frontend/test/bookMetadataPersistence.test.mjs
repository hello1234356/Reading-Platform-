import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  NO_BOOK_DESCRIPTION,
  loadBookDetailsSafely,
  loadProviderBookDetails,
} from "../src/lib/bookDetails.js";

test("complete stored catalog metadata bypasses provider detail lookup", async () => {
  const stored = {
    bookId: 42,
    source: "google_books",
    externalId: "provider-id",
    title: "Stored title",
    author: "Stored author",
    description: "Stored Supabase description",
    coverUrl: "https://example.test/stored.jpg",
    publisher: "Stored publisher",
    firstPublished: 2020,
    language: "en",
  };

  const result = await loadProviderBookDetails(stored);
  assert.deepEqual(result, stored);
});

test("missing stored description renders immediately and successful enrichment is persisted", async () => {
  const stored = {
    bookId: 42,
    source: "google_books",
    externalId: "provider-id",
    title: "Stored title",
    author: "Stored author",
    coverUrl: "https://example.test/stored.jpg",
    description: "",
  };
  let persisted;
  const result = await loadBookDetailsSafely(
    stored,
    async () => ({
      description: "Recovered provider description",
      publisher: "Recovered publisher",
      language: "en",
    }),
    { persistMetadata: async (book, metadata) => { persisted = { book, metadata }; } },
  );

  assert.equal(result.details.title, "Stored title");
  assert.equal(result.details.coverUrl, "https://example.test/stored.jpg");
  assert.equal(result.details.description, "Recovered provider description");
  assert.equal(persisted.book, stored);
  assert.equal(persisted.metadata.description, "Recovered provider description");
  assert.equal(persisted.metadata.language, "en");
});

test("a subsequent stored load needs no provider request", async () => {
  let providerCalls = 0;
  const storedAfterWriteback = {
    bookId: 42,
    source: "google_books",
    description: "Recovered provider description",
  };
  const result = await loadProviderBookDetails(storedAfterWriteback, async () => {
    providerCalls += 1;
  });
  assert.equal(providerCalls, 0);
  assert.equal(result.description, "Recovered provider description");
});

test("provider failure retains stored fields and exposes only neutral fallback copy", async () => {
  let persistCalls = 0;
  const quotaMessage = "Google Books Search quota is unavailable. Add VITE_GOOGLE_BOOKS_API_KEY.";
  const stored = { bookId: 42, title: "Stored title", author: "Stored author", description: "" };
  const result = await loadBookDetailsSafely(
    stored,
    async () => ({ ...stored, error: quotaMessage, description: quotaMessage }),
    { persistMetadata: async () => { persistCalls += 1; } },
  );

  assert.equal(result.details.title, "Stored title");
  assert.equal(result.details.description, NO_BOOK_DESCRIPTION);
  assert.equal(result.error, "");
  assert.equal(JSON.stringify(result).includes("quota"), false);
  assert.equal(JSON.stringify(result).includes("VITE_GOOGLE_BOOKS_API_KEY"), false);
  assert.equal(persistCalls, 0);
});

test("community fallback copy is not treated as provider metadata or written back", async () => {
  let persistCalls = 0;
  const stored = {
    bookId: 73,
    source: "community",
    title: "Student-entered title",
    author: "Student-entered author",
    description: "",
  };
  const result = await loadBookDetailsSafely(
    stored,
    loadProviderBookDetails,
    { persistMetadata: async () => { persistCalls += 1; } },
  );
  assert.equal(result.details.title, "Student-entered title");
  assert.equal(result.details.description, NO_BOOK_DESCRIPTION);
  assert.equal(persistCalls, 0);
});

test("metadata RPC remains authenticated, identity-bound, and fills without clobbering", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608270001_extend_book_metadata_fill_language.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /if auth\.uid\(\) is null/);
  assert.match(migration, /Book provider identity does not match/);
  assert.match(migration, /Book ISBN does not match/);
  for (const field of ["description", "cover_url", "publisher", "genre", "language"]) {
    assert.match(migration, new RegExp(`${field} = case[\\s\\S]*?else ${field}\\s+end`));
  }
  assert.match(migration, /publication_year = coalesce\(publication_year, p_publication_year\)/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("materialization retains provider metadata and add-to-shelf reuses safe fill", async () => {
  const [materialization, library, metadataApi] = await Promise.all([
    readFile(new URL("../../supabase/migrations/202608250012_book_moderation_integrity.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/libraryApi.js", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/bookMetadataApi.js", import.meta.url), "utf8"),
  ]);
  assert.match(materialization, /insert into public\.books \([\s\S]*cover_url, description,[\s\S]*genre, language, publisher, publication_year/);
  assert.match(materialization, /assessment\.evidence ->> 'coverUrl'/);
  assert.match(materialization, /assessment\.evidence ->> 'description'/);
  assert.match(library, /persistMaterializedBookMetadata\(savedBook, book\)/);
  assert.match(metadataApi, /p_language: metadata\?\.language \|\| null/);
  assert.match(metadataApi, /book\?\.source === "legacy_catalog" \? ""/);
  assert.doesNotMatch(library + metadataApi, /service[_-]?role/i);
});
