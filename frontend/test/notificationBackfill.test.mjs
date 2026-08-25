import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608250007_historical_notification_backfill.sql",
  import.meta.url,
);

test("historical backfill uses stable sources and original timestamps", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /true, post_likes\.created_at[\s\S]*from public\.post_likes/);
  assert.match(sql, /true, comments\.created_at[\s\S]*from public\.comments/);
  assert.match(sql, /true, book_submissions\.updated_at[\s\S]*from public\.book_submissions/);
  assert.doesNotMatch(sql, /false, (?:post_likes|comments|book_submissions)\./);
});

test("historical backfill is idempotent and prevents self notifications", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.ok((sql.match(/on conflict \(dedupe_key\) do nothing/g) || []).length >= 5);
  assert.match(sql, /posts\.user_id <> post_likes\.user_id/);
  assert.match(sql, /reply_sources\.reply_recipient <> reply_sources\.user_id/);
  assert.match(sql, /comment_mentions\.mentioned_user_id <> comments\.user_id/);
});

test("reply priority suppresses duplicate mention notifications", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /mentioned_user_id is distinct from coalesce\([\s\S]*direct_parent\.user_id/);
  assert.match(sql, /primary key|on conflict \(comment_id, mentioned_user_id\) do nothing/i);
  assert.match(sql, /profiles\.username = candidate\[2\]/);
});

test("historical targets use exact stable IDs and no generic root", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /'\/post\/' \|\| posts\.id::text/);
  assert.match(sql, /'&reply=' \|\| comments\.id::text/);
  assert.match(sql, /'\/discover\?bookId=' \|\| book_submissions\.approved_book_id::text/);
  assert.doesNotMatch(sql, /target_url[\s\S]{0,100}'\/'\s*,/i);
});
