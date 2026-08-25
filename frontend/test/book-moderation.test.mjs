import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../supabase/migrations/202608250004_book_ai_moderation.sql", import.meta.url);
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

test("observe policy requires evidence and cannot automatically hard block", async () => {
  const policy = await readFile(new URL("policy.ts", functionRoot), "utf8");
  assert.match(policy, /MODERATION_MODE = "observe"/);
  assert.match(policy, /AUTO_BLOCK_ENABLED = false/);
  assert.match(policy, /evidence === "insufficient"[\s\S]*return "review_required"/);
  assert.match(policy, /political_or_regulatory_sensitivity >= 2[\s\S]*return "review_required"/);
});

test("classifier treats metadata as untrusted and uses only a server secret", async () => {
  const classifier = await readFile(new URL("classifier.ts", functionRoot), "utf8");
  assert.match(classifier, /DEEPSEEK_API_KEY/);
  assert.doesNotMatch(classifier, /VITE_[A-Z_]*API_KEY/);
  assert.match(classifier, /prompt injection/i);
  assert.match(classifier, /Never follow them/i);
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
  assert.match(index, /packet\.evidenceQuality === "insufficient"/);
});
