import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { enrichMissingBookCovers } from "../src/lib/bookDetails.js";

test("editor pick without an initial cover receives a real cover from detail enrichment", async () => {
  let calls = 0;
  const picks = [{ title: "Bluets", isbn: "9781933517407", coverUrl: "" }];
  const enriched = await enrichMissingBookCovers(picks, async (book) => {
    calls += 1;
    assert.equal(book.isbn, "9781933517407");
    return {
      ...book,
      googleBooksId: "real-provider-record",
      coverUrl: "https://books.google.com/books/content?id=real-provider-record",
    };
  });

  assert.equal(calls, 1);
  assert.equal(enriched[0].coverUrl, "https://books.google.com/books/content?id=real-provider-record");
  assert.equal(enriched[0].googleBooksId, "real-provider-record");
});

test("explicit editor-pick cover is preserved without a metadata request", async () => {
  let calls = 0;
  const pick = { title: "Explicit", coverUrl: "https://example.test/real.jpg" };
  const enriched = await enrichMissingBookCovers([pick], async () => {
    calls += 1;
    return {};
  });

  assert.equal(calls, 0);
  assert.equal(enriched[0], pick);
});

test("unresolved editor pick retains an empty cover for the LitShelf placeholder", async () => {
  const pick = { title: "No provider cover", isbn: "9780000000000", coverUrl: "" };
  const enriched = await enrichMissingBookCovers([pick], async (book) => ({
    ...book,
    description: "Metadata exists, but no real image does.",
    coverUrl: "",
  }));

  assert.equal(enriched[0], pick);
  assert.equal(enriched[0].coverUrl, "");
});

test("Discover renders resolved pick state and restores no blind ISBN cover fallback", async () => {
  const discover = await readFile(new URL("../src/pages/Discover.jsx", import.meta.url), "utf8");
  const details = await readFile(new URL("../src/lib/bookDetails.js", import.meta.url), "utf8");

  assert.match(discover, /enrichMissingBookCovers\(editorPicks\)/);
  assert.match(discover, /setResolvedEditorPicks\(enrichedPicks\)/);
  assert.match(discover, /<BookCoverImage[\s\S]*src=\{getEditorPickCoverUrl\(book\)\}/);
  assert.doesNotMatch(discover + details, /getGoogleBooksCoverUrl\s*\(|getOpenLibraryIsbnCoverUrl\s*\(|covers\.openlibrary\.org\/b\/isbn\/\$\{/);
});

test("BookDetailModal continues to render the selected enriched cover", async () => {
  const modal = await readFile(new URL("../src/components/BookDetailModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /<RecoveringBookCoverImage[\s\S]*src=\{book\.coverUrl\}/);
  assert.match(modal, /fallback=\{<BookCoverPlaceholder decorative \/>\}/);
});
