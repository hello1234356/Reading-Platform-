// Optional isolated PostgreSQL-WASM verification; never connects to Supabase.
// PGLITE_MODULE=/path/to/pglite/dist/index.js node --test test/book-review-origin-db.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('isolated database: first origin, cached/legacy exclusions, immutable audit and RLS',
  { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create function public.is_admin() returns boolean language sql as
        $$ select coalesce(current_setting('test.admin', true), 'false') = 'true' $$;
      create table books(id bigint, source text, external_id text);
      create table book_moderation_assessments(
        id uuid primary key default gen_random_uuid(), source text, external_id text,
        evidence jsonb, evidence_quality text, policy_version text, model_version text,
        status text default 'pending', unique(source, external_id, policy_version));
      create table book_moderation_events(
        id bigint generated always as identity primary key,
        assessment_id uuid references book_moderation_assessments,
        event_type text constraint book_moderation_events_event_type_check check(event_type in ('ai_assessed')),
        next_status text);
      alter table book_moderation_events enable row level security;
      grant select on book_moderation_events to authenticated;
      create policy admin_read on book_moderation_events for select to authenticated using(public.is_admin());
    `);
    for (const file of ['202608260002_book_provider_evidence_cache.sql', '202609090003_book_review_origin.sql']) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const a = '00000000-0000-0000-0000-000000000001';
    const b = '00000000-0000-0000-0000-000000000002';
    const cache = (id, user, policy = 'v1') => db.query(`select cache_book_evidence_for_review(
      'google_books', $1, '{"title":"Verified book"}', now(), now() + interval '7 days', $2, 'model', $3)`, [id, policy, user]);
    const origins = async () => (await db.query('select initiated_by_user_id from book_moderation_events order by id')).rows;
    await cache('new', a);
    assert.deepEqual(await origins(), [{ initiated_by_user_id: a }]);
    assert.equal((await db.query('select status from book_moderation_assessments')).rows[0].status, 'pending');
    await cache('new', b);
    await cache('new', b, 'v2');
    await db.exec("update book_moderation_assessments set status = 'review_required', evidence = '{}'::jsonb");
    assert.deepEqual(await origins(), [{ initiated_by_user_id: a }]);
    await assert.rejects(db.query('update book_moderation_events set initiated_by_user_id = $1', [b]), /immutable/);
    await db.exec("insert into book_moderation_assessments(source, external_id, policy_version) values ('google_books','old','v0')");
    await cache('old', b);
    await db.exec("insert into books values (1,'google_books','catalog')");
    await cache('catalog', b);
    assert.equal((await origins()).length, 1);
    await cache('anonymous', null);
    assert.equal((await origins())[1].initiated_by_user_id, null);
    // Overlapping callers through the DB adapter: the cache unique key elects one winner.
    // PGlite serializes sessions; true multi-session lock contention needs staging PostgreSQL.
    await Promise.all([cache('race', a), cache('race', b)]);
    assert.equal((await origins()).length, 3);
    assert.equal((await origins())[2].initiated_by_user_id, a);
    await db.exec('set role authenticated');
    assert.deepEqual((await db.query('select * from book_moderation_events')).rows, []);
    await assert.rejects(db.query("select * from get_book_review_origin('google_books','new')"), /Only admins/);
    await assert.rejects(cache('forged', b), /permission denied/);
    await db.exec("set test.admin = 'true'");
    assert.equal((await db.query("select * from get_book_review_origin('google_books','new')")).rows[0].initiated_by_user_id, a);
    assert.deepEqual((await db.query("select * from get_book_review_origin('google_books','old')")).rows, []);
  } finally { await db.close(); }
});
