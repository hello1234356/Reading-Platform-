import assert from "node:assert/strict";
import test from "node:test";
import {
  createLatestRequestGate,
  rankBookSearchResults,
  scoreBookSearchResult,
} from "../src/lib/bookSearchRelevance.js";
import {
  buildGoogleBooksSearchUrl,
  detectSearchLanguage,
} from "../src/lib/googleBooksSearchConfig.js";
import { areCatalogResultsSufficient } from "../src/lib/communityBooks.js";

test("query language routing is based on the literal script", () => {
  assert.equal(detectSearchLanguage("harry potter"), "en");
  assert.equal(detectSearchLanguage("Harry Potter"), "en");
  assert.equal(detectSearchLanguage("the good earth"), "en");
  assert.equal(detectSearchLanguage("活着"), "zh");
  assert.equal(detectSearchLanguage("边城"), "zh");
});

test("Google Books request matches the last known-good provider shape", () => {
  const url = buildGoogleBooksSearchUrl("harry potter", 20, "test-key");
  assert.equal(url.origin, "https://www.googleapis.com");
  assert.equal(url.pathname, "/books/v1/volumes");
  assert.equal(url.searchParams.get("key"), "test-key");
  assert.equal(url.searchParams.get("q"), "harry potter");
  assert.equal(url.searchParams.get("printType"), "books");
  assert.equal(url.searchParams.has("orderBy"), false);
  assert.equal(url.searchParams.get("langRestrict"), "en");
  assert.equal(url.searchParams.get("maxResults"), "20");
  assert.equal(url.searchParams.has("startIndex"), false);
  assert.deepEqual([...url.searchParams.keys()], [
    "key", "q", "printType", "langRestrict", "maxResults",
  ]);
});

test("canonical Harry Potter titles outrank commentary and unrelated metadata matches", () => {
  const candidates = [
    { title: "A Chinese commentary book mentioning Harry Potter", author: "Commentator" },
    { title: "The Sphere", author: "Unknown" },
    { title: "Harry Potter and the Prisoner of Azkaban", author: "J.K. Rowling" },
    { title: "Harry Potter and the Sorcerer's Stone", author: "J.K. Rowling" },
    { title: "Harry Potter and the Chamber of Secrets", author: "J.K. Rowling" },
  ];
  const ranked = rankBookSearchResults("harry potter", candidates, 10);
  assert.deepEqual(ranked.slice(0, 3).map((book) => book.title), [
    "Harry Potter and the Prisoner of Azkaban",
    "Harry Potter and the Sorcerer's Stone",
    "Harry Potter and the Chamber of Secrets",
  ]);
  assert.equal(ranked.some((book) => book.title === "The Sphere"), false);
  assert.ok(scoreBookSearchResult("harry potter", candidates[2]) >
    scoreBookSearchResult("harry potter", candidates[0]));
});

test("complete title tokens and author matches have deterministic intermediate scores", () => {
  assert.ok(scoreBookSearchResult("good earth", { title: "The Good Earth", author: "Pearl Buck" }) >= 750);
  assert.ok(scoreBookSearchResult("j k rowling", { title: "The Casual Vacancy", author: "J. K. Rowling" }) >= 650);
  assert.equal(scoreBookSearchResult("harry potter", {
    title: "The Sphere", author: "Someone", description: "Compared with Harry Potter",
  }), 0);
});

test("Chinese exact-title ranking remains independent of English franchise behavior", () => {
  const ranked = rankBookSearchResults("活着", [
    { title: "活着的意义", author: "Other" },
    { title: "活着", author: "余华" },
    { title: "边城", author: "沈从文" },
  ]);
  assert.deepEqual(ranked.map((book) => book.title), ["活着", "活着的意义"]);
  assert.equal(ranked[0].searchRelevanceScore, 1000);
});

test("latest request gate deterministically suppresses an older completion", async () => {
  const gate = createLatestRequestGate();
  const older = gate.begin();
  const newer = gate.begin();
  await Promise.resolve();
  assert.equal(gate.isCurrent(older), false);
  assert.equal(gate.isCurrent(newer), true);
});

test("one catalog hit cannot suppress the external canonical-title search", () => {
  assert.equal(areCatalogResultsSufficient([{
    title: "Harry Potter", author: "Unknown", externalId: "one-local-hit",
  }], "harry potter", 20), false);
});

