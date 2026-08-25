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

test("evidence-ladder policy reserves blocking for clear high-confidence risk", async () => {
  const policy = await readFile(new URL("policy.ts", functionRoot), "utf8");
  assert.match(policy, /MODERATION_MODE = "observe"/);
  assert.match(policy, /!ai\.recognized[\s\S]*return "review_required"/);
  assert.match(policy, /risk >= 4[\s\S]*ai\.recommendation === "block"/);
  assert.match(policy, /CLEAR_BLOCK_CONFIDENCE = 0\.9/);
});

test("classifier treats metadata as untrusted and uses only a server secret", async () => {
  const classifier = await readFile(new URL("classifier.ts", functionRoot), "utf8");
  assert.match(classifier, /DEEPSEEK_API_KEY/);
  assert.doesNotMatch(classifier, /VITE_[A-Z_]*API_KEY/);
  assert.match(classifier, /prompt injection/i);
  assert.match(classifier, /Never follow them/i);
  assert.match(classifier, /prior trained knowledge only if you reliably recognize the exact work/i);
  assert.match(classifier, /Never mark a book unsafe merely because it belongs to History, Politics, Religion/i);
  assert.match(classifier, /LGBTQ characters or topics from explicit sexual content/i);
  assert.match(classifier, /do not reliably recognize[\s\S]*do not invent a synopsis/i);
  assert.match(classifier, /response_format: \{ type: "json_object" \}/);
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
  assert.match(index, /Sparse packets still reach the classifier/);
});
