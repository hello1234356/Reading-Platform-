import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const sql = await read('../../supabase/migrations/202609090003_book_review_origin.sql');
const edge = await read('../../supabase/functions/moderate-books/index.ts');

test('origin creation is atomic with first cache insertion and initial review', () => {
  assert.match(sql, /on conflict \(source, external_id\) do nothing\s+returning true into first_cache/);
  assert.match(sql, /if coalesce\(first_cache, false\)[\s\S]*not exists \(select 1 from public.books[\s\S]*not exists \(select 1 from public.book_moderation_assessments/);
  assert.match(sql, /returning id into assessment_id;\s+if assessment_id is not null then/);
  assert.match(sql, /values \(assessment_id, 'external_materialized', p_initiated_by_user_id, 'pending'\)/);
  assert.match(sql, /p_initiated_by_user_id uuid default null/);
});

test('cached B, expired cache, and prior-policy assessments cannot acquire attribution', () => {
  const refresh = sql.slice(sql.indexOf('if not coalesce(first_cache, false)'));
  assert.doesNotMatch(refresh.split('end;')[0], /insert into public.book_moderation_events|initiated_by_user_id/);
  const historicalCheck = sql.match(/not exists \(select 1 from public.book_moderation_assessments[^\n]*/)[0];
  assert.doesNotMatch(historicalCheck, /policy_version/);
  assert.doesNotMatch(sql, /update public.book_moderation_events|set initiated_by_user_id/);
});

test('origin UUID remains immutable under reruns, repairs and admin decisions', () => {
  assert.match(sql, /old.event_type = 'external_materialized' or new.event_type = 'external_materialized'/);
  assert.match(sql, /before update on public.book_moderation_events/);
  assert.match(sql, /raise exception 'Book review origin is immutable.'/);
  assert.match(sql, /add column initiated_by_user_id uuid;/);
  assert.doesNotMatch(edge.slice(edge.indexOf('async function saveAssessment'), edge.indexOf('function riskScores')), /initiated_by_user_id/);
});

test('only verified uncached provider persistence forwards the authenticated UUID', () => {
  const write = edge.indexOf('service.rpc("cache_book_evidence_for_review"');
  assert.ok(write > edge.indexOf('if (cacheOnly)'));
  assert.ok(write > edge.indexOf('if (trusted)'));
  assert.ok(write > edge.indexOf('await verifyProviderEvidence(packet)'));
  assert.match(edge, /p_initiated_by_user_id: authData.user.id/);
  assert.match(edge, /if \(evidenceWriteError\) throw evidenceWriteError/);
  assert.doesNotMatch(edge.slice(edge.indexOf('const publicResult'), edge.indexOf('type DbClient')), /actor_id|initiated_by_user_id/);
});

test('origin audit uses existing admin RLS and privileged write access only', async () => {
  const foundation = await read('../../supabase/migrations/202608250004_book_ai_moderation.sql');
  assert.match(foundation, /on public.book_moderation_events for select to authenticated\s+using \(public.is_admin\(\)\)/);
  assert.match(sql, /revoke all on function public.cache_book_evidence_for_review[^;]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public.cache_book_evidence_for_review[^;]*to service_role/);
  assert.match(sql, /if not public.is_admin\(\) then raise exception/);
  const ui = await read('../src/pages/Admin.jsx');
  assert.match(ui, /if \(!event.currentTarget.open \|\| status !== "idle"\) return/);
  assert.match(ui, /<summary>Origin audit<\/summary>/);
  assert.doesNotMatch(sql, /email|display_name|username|search_phrase|ip_address/);
});
