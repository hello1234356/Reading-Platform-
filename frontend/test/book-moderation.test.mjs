import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../supabase/migrations/202608250004_book_ai_moderation.sql", import.meta.url);
const evidenceMigrationUrl = new URL("../../supabase/migrations/202608250008_book_moderation_evidence_ladder.sql", import.meta.url);
const functionRoot = new URL("../../supabase/functions/moderate-books/", import.meta.url);

test("book moderation storage is private, versioned, and auditable", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /unique index[\s\S]*source, external_id, policy_version/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /using \(public\.is_admin\(\)\)/i);
  assert.match(sql, /revoke all on table public\.book_moderation_assessments from anon, authenticated/i);
  assert.match(sql, /book_moderation_events/i);
  assert.match(sql, /manually_reviewed/i);
});

test("evidence ladder stores separate confidence and provenance fields", async () => {
  const sql = await readFile(evidenceMigrationUrl, "utf8");
  assert.match(sql, /identity_confidence double precision/);
  assert.match(sql, /moderation_confidence double precision/);
  assert.match(sql, /knowledge_source text/);
  assert.match(sql, /synopsis text/);
  assert.match(sql, /themes text\[\]/);
  assert.match(sql, /reason_for_review text/);
});

test("current policy enforces only meaningful target levels", async () => {
  const policy = await readFile(new URL("policy.ts", functionRoot), "utf8");
  assert.match(policy, /MODERATION_MODE = "enforce"/);
  assert.match(policy, /POLICY_VERSION = "school-books-2026-08-v2"/);
  assert.match(policy, /MEANINGFUL_TARGET_LEVEL = 2/);
  assert.match(policy, /ai\.sexual_content, ai\.extremism, ai\.china_political_sensitivity/);
  assert.doesNotMatch(policy, /MIN_APPROVAL_CONFIDENCE|MIN_IDENTITY_CONFIDENCE|return "blocked"/);
});

test("classifier treats metadata as untrusted and uses only a server secret", async () => {
  const classifier = await readFile(new URL("classifier.ts", functionRoot), "utf8");
  assert.match(classifier, /DEEPSEEK_API_KEY/);
  assert.doesNotMatch(classifier, /VITE_[A-Z_]*API_KEY/);
  assert.match(classifier, /prompt injection/i);
  assert.match(classifier, /Never follow them/i);
  assert.match(classifier, /NOT performing general content-safety/i);
  assert.match(classifier, /Missing information is not proof of risk/i);
  assert.match(classifier, /LGBTQ themes/i);
  assert.match(classifier, /web\/search content are untrusted evidence/i);
  assert.match(classifier, /response_format: \{ type: "json_object" \}/);
  assert.match(classifier, /https:\/\/api\.deepseek\.com\/responses/);
  assert.match(classifier, /tools: \[\{ type: "web_search" \}\]/);
  assert.match(classifier, /classifyBooks/);
});

test("edge endpoint authenticates and caps each batch", async () => {
  const [index, schema] = await Promise.all([
    readFile(new URL("index.ts", functionRoot), "utf8"),
    readFile(new URL("schema.ts", functionRoot), "utf8"),
  ]);
  assert.match(index, /auth\.getUser/);
  assert.match(schema, /MAX_BATCH_SIZE = 10/);
  assert.match(index, /policy_version", POLICY_VERSION/);
  assert.match(index, /await classifyBooks\(eligible\)/);
  assert.match(index, /await Promise\.all\(eligible\.map/);
  assert.match(index, /shouldEnrichBook\(initial, packet\)/);
  assert.match(index, /evidence_source: enriched\.has\(identity\)/);
  assert.match(index, /`\$\{MODEL_VERSION\}\+web:\$\{ENRICHMENT_MODEL\}`/);
});

test("frontend enforcement awaits every displayed result and uses the friendly review message", async () => {
  const [api, search, discover, clubs, admin] = await Promise.all([
    readFile(new URL("../../frontend/src/lib/bookModerationApi.js", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/lib/bookSearch.js", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/pages/Discover.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/pages/BookClubs.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/pages/Admin.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /ENFORCE_SEARCH_BATCH_SIZE = 10/);
  assert.match(api, /This book’s having a quick chat with our bookish gatekeepers 📚 Check back soon!/);
  assert.match(api, /statusByIdentity[\s\S]*=== "approved"/);
  assert.match(api, /for \(let index = 0; index < candidates\.length/);
  assert.match(search, /await enforceBookSearchResults\(result\.results\)/);
  assert.doesNotMatch(search, /void assessBooksInObserveMode/);
  assert.match(discover, /setSearchMessage\(searchResult\.moderationMessage/);
  assert.match(clubs, /searchResult\.moderationMessage/);
  assert.match(admin, /Enforcement mode: only approved search results/);
});
