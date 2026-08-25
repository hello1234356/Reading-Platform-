import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assessEvidenceQuality } from "../../supabase/functions/moderate-books/evidence.ts";
import { applyEnrichmentFailurePolicy, applyPolicy, needsWebEnrichment, shouldEnrichBook }
  from "../../supabase/functions/moderate-books/policy.ts";

const root = new URL("../src/", import.meta.url);
const base = {
  recommendation: "approve", recognized: true, identity_confidence: 0.96,
  moderation_confidence: 0.94, knowledge_source: "provider_evidence",
  evidence_quality: "high", sexual_content: 0, extremism: 0,
  china_political_sensitivity: 0, needs_web_enrichment: false, enrichment_reason: "",
  flags: [], synopsis: "", themes: [], reasoning_summary: "",
};

test("famous sparse book can proceed using reliable prior knowledge", () => {
  const evidence = assessEvidenceQuality({ source: "open_library", externalId: "OL-live",
    title: "活着", authors: ["余华"], description: "", categories: [], subjects: [] });
  assert.equal(evidence, "very_low");
  assert.equal(applyPolicy({ ...base, knowledge_source: "model_prior_knowledge" }, evidence), "approved");
});

test("unrecognized sparse book with no target signal is approved", () => {
  const result = { ...base, recognized: false, identity_confidence: 0.2,
    knowledge_source: "model_prior_knowledge", recommendation: "approve", synopsis: "" };
  assert.equal(applyPolicy(result), "approved");
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

test("historical extremist discussion differs from extremist advocacy", () => {
  assert.equal(applyPolicy({ ...base, extremism: 0,
    themes: ["historical discussion of extremist ideology"] }, "high"), "approved");
  assert.equal(applyPolicy({ ...base, recommendation: "review_required", extremism: 3,
    moderation_confidence: 0.96 }), "review_required");
});

test("only the three target dimensions can cause review", () => {
  const harmlessFixtures = ["WWII violence", "suicide and depression", "crime novel",
    "drug-addiction memoir", "war memoir", "dark literary fiction", "romance with kissing",
    "LGBTQ romance", "pregnancy and puberty", "1911 encyclopedia", "Tang dynasty history",
    "Li Bai biography", "Chinese mythology", "Ming historical fiction"];
  harmlessFixtures.forEach((synopsis) => assert.equal(applyPolicy({ ...base, synopsis,
    recognized: false, identity_confidence: 0.1, moderation_confidence: 0.2,
    evidence_quality: "very_low" }), "approved", synopsis));
  assert.equal(applyPolicy({ ...base, sexual_content: 2 }), "review_required");
  assert.equal(applyPolicy({ ...base, extremism: 2 }), "review_required");
  assert.equal(applyPolicy({ ...base, china_political_sensitivity: 2 }), "review_required");
});

test("weak target signals enrich and failure depends on an existing signal", () => {
  const weak = { ...base, sexual_content: 1, recommendation: "enrich",
    needs_web_enrichment: true };
  assert.equal(needsWebEnrichment(weak), true);
  assert.equal(applyEnrichmentFailurePolicy(weak), "review_required");
  const noSignal = { ...base, recommendation: "enrich", needs_web_enrichment: true };
  assert.equal(applyEnrichmentFailurePolicy(noSignal), "approved");
  assert.equal(shouldEnrichBook(noSignal, { title: "Encyclopaedia Britannica 1911",
    description: "A general reference work", categories: ["Reference"], subjects: [] }), false);
  assert.equal(shouldEnrichBook(weak, { title: "Ambiguous adult romance",
    description: "", categories: ["Romance"], subjects: [] }), true);
});
