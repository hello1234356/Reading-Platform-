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
  assert.match(policy, /POLICY_VERSION = "school-books-2026-08-v3"/);
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
  assert.match(classifier, /deepseek-v4-flash/);
  assert.match(classifier, /max_tokens: 6000/);
  assert.match(classifier, /finish_reason === "length"/);
  assert.match(classifier, /classification_truncated/);
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
  assert.match(index, /"classifier_unavailable"/);
  assert.match(index, /`\$\{MODEL_VERSION\}\+web:\$\{ENRICHMENT_MODEL\}`/);
});

test("frontend renders checking cards before asynchronous moderation and keeps durable states distinct", async () => {
  const [api, search, discover, clubs, status, admin, adminApi] = await Promise.all([
    readFile(new URL("../../frontend/src/lib/bookModerationApi.js", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/lib/bookSearch.js", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/pages/Discover.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/pages/BookClubs.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/lib/bookModerationStatus.js", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/pages/Admin.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/lib/adminApi.js", import.meta.url), "utf8"),
  ]);
  assert.match(api, /MODERATION_BATCH_SIZE = 5/);
  assert.match(api, /MAX_CONCURRENT_MODERATION_BATCHES = 2/);
  assert.match(api, /body: \{ books: batch, cacheOnly \}/);
  assert.match(api, /await invoke\(unique, true/);
  assert.match(api, /await invoke\(requiringAi, false/);
  assert.match(search, /initializeBookModerationResults\(rankedResults\)/);
  assert.match(search, /startModeration: \(onUpdate\)/);
  assert.match(search, /firstResultsRenderedMs: providerDurationMs/);
  assert.doesNotMatch(search, /await (?:enforce|moderate)BookSearchResults/);
  assert.match(discover, /<BookModerationStatus book=\{book\}/);
  assert.match(clubs, /<BookModerationStatus book=\{book\}/);
  assert.match(status, /Our bookish gatekeepers are checking this book/);
  assert.match(status, /Add to Shelf will unlock automatically/);
  assert.match(status, /taking a closer look at this one/);
  assert.match(status, /couldn't finish checking this book/);
  assert.match(status, /Retry check/);
  assert.doesNotMatch(discover,
    /className="isbn-result-details-button"[\s\S]{0,180}disabled=\{!isModerationApproved\}/);
  assert.match(discover, /onRetry=\{retryBookModeration\}/);
  assert.match(discover, /Add to Shelf — checking…/);
  assert.doesNotMatch(discover, /moderationStatus === "blocked"[\s\S]*\.filter/);
  assert.doesNotMatch(clubs, /moderationStatus === "blocked"[\s\S]*\.filter/);
  assert.match(admin, /only approved books can be opened or used/);
  assert.match(admin, /Technical moderation failure/);
  assert.match(admin, /This is not a content-review decision/);
  assert.match(admin, /Approve manually/);
  assert.doesNotMatch(adminApi, /\.eq\("policy_version", "school-books-2026-08-v2"\)/);
  assert.match(adminApi, /list_effective_book_moderation_assessments/);
  assert.doesNotMatch(adminApi, /resolveEffectiveBookModerationRows/);
});
