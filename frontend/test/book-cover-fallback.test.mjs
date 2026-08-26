import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getBookCoverSourceAfterError,
  normalizeBookCoverSource,
} from "../src/lib/bookCoverSource.js";
import {
  getPreferredGoogleBooksCoverUrl,
  mapGoogleBooksResult,
} from "../src/lib/googleBooks.js";

test("missing and failed cover sources resolve to the shared placeholder state", () => {
  assert.equal(normalizeBookCoverSource(""), "");
  assert.equal(normalizeBookCoverSource(null), "");
  assert.equal(getBookCoverSourceAfterError("https://example.test/broken.jpg"), "");
});

test("explicit provider cover URLs remain real image sources", () => {
  const googleCover = "https://books.google.com/books/content?id=real-cover";
  const openLibraryCover = "https://covers.openlibrary.org/b/id/123-L.jpg?default=false";

  assert.equal(normalizeBookCoverSource(googleCover), googleCover);
  assert.equal(normalizeBookCoverSource(openLibraryCover), openLibraryCover);
  assert.equal(getPreferredGoogleBooksCoverUrl(googleCover), googleCover);
});

test("Google results without imageLinks never manufacture an ISBN cover", () => {
  const mapped = mapGoogleBooksResult({
    id: "volume-without-cover",
    volumeInfo: {
      title: "Coverless Book",
      industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000002" }],
    },
  });

  assert.equal(mapped.isbn, "9780000000002");
  assert.equal(mapped.coverUrl, "");
  assert.equal(getPreferredGoogleBooksCoverUrl("", mapped.isbn), "");
});

test("recommendation sections use only explicit cover URLs", async () => {
  const source = await readFile(
    new URL("../src/pages/RecommendationPost.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /String\(section\.coverUrl \|\| ""\)\.trim\(\)/);
  assert.match(source, /<BookCoverImage/);
  assert.doesNotMatch(source, /getGoogleBooksCoverUrl|getOpenLibraryIsbnCoverUrl/);
});

test("book cover image swaps missing and failed sources to the shared placeholder", async () => {
  const source = await readFile(
    new URL("../src/components/BookCoverImage.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(!currentState\.src\)/);
  assert.match(source, /<BookCoverPlaceholder/);
  assert.match(source, /getBookCoverSourceAfterError\(\)/);
  assert.doesNotMatch(source, /fallbackSrc|getGoogleBooksCoverUrl|getOpenLibraryIsbnCoverUrl/);
});
