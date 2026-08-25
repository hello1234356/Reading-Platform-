import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNextImageErrorState } from "../src/lib/imageRetryState.js";
import { canRepairStoredBookCover } from "../src/lib/bookCoverRepairModel.js";

test("cover image failure retries once before reaching terminal fallback", () => {
  const firstFailure = getNextImageErrorState("https://example.test/cover.jpg", 0);
  assert.deepEqual(firstFailure, {
    src: "https://example.test/cover.jpg",
    attempts: 1,
    failed: false,
    finalFailure: false,
  });

  const secondFailure = getNextImageErrorState(firstFailure.src, firstFailure.attempts);
  assert.equal(secondFailure.attempts, 2);
  assert.equal(secondFailure.failed, true);
  assert.equal(secondFailure.finalFailure, true);
});

test("only precisely identified supported provider records can request repair", () => {
  const base = { bookId: 42, coverUrl: "https://example.test/stale.jpg" };
  assert.equal(canRepairStoredBookCover({ ...base, source: "google_books" }), true);
  assert.equal(canRepairStoredBookCover({ ...base, source: "open_library" }), true);
  assert.equal(canRepairStoredBookCover({ ...base, source: "community" }), false);
  assert.equal(canRepairStoredBookCover({ ...base, source: "isbn_work" }), false);
  assert.equal(canRepairStoredBookCover({ ...base, bookId: "" }), false);
});

test("cover repair migration enforces an atomic 24-hour service-role-only cooldown", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/202608250003_book_cover_repair.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /for update/i);
  assert.match(migration, /interval '24 hours'/i);
  assert.match(migration, /grant execute[\s\S]+service_role/i);
  assert.match(migration, /revoke all[\s\S]+anon, authenticated/i);
});

test("repair function uses exact provider identities and no title search", () => {
  const edgeFunction = readFileSync(
    new URL("../../supabase/functions/repair-book-cover/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(edgeFunction, /volumes\/\$\{encodeURIComponent\(externalId\)\}/);
  assert.match(edgeFunction, /openlibrary\.org\$\{key\}\.json/);
  assert.doesNotMatch(edgeFunction, /search\.json|intitle:|inauthor:/i);
});
