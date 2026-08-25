import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assessEvidenceQuality } from "../../supabase/functions/moderate-books/evidence.ts";
import { applyPolicy } from "../../supabase/functions/moderate-books/policy.ts";

const root = new URL("../src/", import.meta.url);
const base = {
  recommendation: "approve", recognized: true, identity_confidence: 0.96,
  moderation_confidence: 0.94, knowledge_source: "provider_evidence",
  evidence_quality: "high", sexual_content: 0, violence: 0, self_harm: 0,
  drugs_or_gambling: 0, hate_or_extremism: 0,
  political_or_regulatory_sensitivity: 0, age_suitability: 0,
  flags: [], synopsis: "", themes: [], reasoning_summary: "",
};

test("famous sparse book can proceed using reliable prior knowledge", () => {
  const evidence = assessEvidenceQuality({ source: "open_library", externalId: "OL-live",
    title: "活着", authors: ["余华"], description: "", categories: [], subjects: [] });
  assert.equal(evidence, "very_low");
  assert.equal(applyPolicy({ ...base, knowledge_source: "model_prior_knowledge" }, evidence), "approved");
});

test("unrecognized obscure book requires review and no fabricated synopsis", () => {
  const result = { ...base, recognized: false, identity_confidence: 0.2,
    knowledge_source: "model_prior_knowledge", recommendation: "review_required", synopsis: "" };
  assert.equal(applyPolicy(result, "very_low"), "review_required");
  assert.equal(result.synopsis, "");
});

test("provider missing-description placeholders remain very-low evidence", () => {
  assert.equal(assessEvidenceQuality({ source: "open_library", externalId: "OL-obscure",
    title: "Obscure", authors: [], description:
      "Open Library does not have an official description for this edition yet.",
    categories: [], subjects: [] }), "very_low");
});

test("broad genres do not prevent classification or force a verdict", async () => {
  const terms = ["History", "Political Science", "Biography", "Religion", "Historical Fiction"];
  terms.forEach((genre) => {
    assert.equal(applyPolicy({ ...base, synopsis: `Benign ${genre} discussion` }, "medium"), "approved");
  });
  const [google, search, discover, clubs, openLibrary, isbnWork] = await Promise.all([
    readFile(new URL("lib/googleBooks.js", root), "utf8"),
    readFile(new URL("lib/bookSearch.js", root), "utf8"),
    readFile(new URL("pages/Discover.jsx", root), "utf8"),
    readFile(new URL("pages/BookClubs.jsx", root), "utf8"),
    readFile(new URL("lib/openLibraryBooks.js", root), "utf8"),
    readFile(new URL("lib/isbnWorkBooks.js", root), "utf8"),
  ]);
  const activeVisibilityCode = [google, search, discover, clubs, openLibrary, isbnWork].join("\n");
  assert.doesNotMatch(activeVisibilityCode, /isBlockedGoogleBooks|blockedCategoryPatterns|BLOCKED_BOOK_CATEGORY_MESSAGE/);
});

test("provider mappings retain available moderation evidence", async () => {
  const [google, openLibrary, api] = await Promise.all([
    readFile(new URL("lib/googleBooks.js", root), "utf8"),
    readFile(new URL("lib/openLibraryBooks.js", root), "utf8"),
    readFile(new URL("lib/bookModerationApi.js", root), "utf8"),
  ]);
  assert.match(google, /categories: Array\.isArray\(info\.categories\)/);
  assert.match(google, /maturityRating: info\.maturityRating/);
  assert.match(openLibrary, /subjects: Array\.isArray\(doc\.subject\)/);
  assert.match(api, /providerMetadata/);
  assert.match(api, /coverUrl/);
});

test("historical extremist discussion differs from high-confidence prohibited content", () => {
  assert.equal(applyPolicy({ ...base, hate_or_extremism: 1,
    themes: ["historical discussion of extremist ideology"] }, "high"), "approved");
  assert.equal(applyPolicy({ ...base, recommendation: "block", hate_or_extremism: 4,
    moderation_confidence: 0.96 }, "high"), "blocked");
});
