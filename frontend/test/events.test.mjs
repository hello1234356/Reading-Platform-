import test from 'node:test';
import assert from 'node:assert/strict';
import { validDisplayPhoto } from '../src/lib/eventsApi.js';
import { events, eventText } from '../src/data/events.js';
import { eventsEn, eventsZh } from '../src/i18n/events.js';
test('display uploads reject unsupported, empty, and oversized files', () => {
  assert.equal(validDisplayPhoto(null), false);
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validDisplayPhoto({ type, size: 5242880 }), true);
    assert.equal(validDisplayPhoto({ type, size: 5242881 }), false);
    assert.equal(validDisplayPhoto({ type, size: 0 }), false);
  }
  assert.equal(validDisplayPhoto({ type: 'image/svg+xml', size: 100 }), false);
});
test('Events remain bilingual with no fabricated festival article or schedule', () => {
  assert.deepEqual(Object.keys(eventsEn).sort(), Object.keys(eventsZh).sort());
  assert.equal(new Set(events.map(event => event.slug)).size, events.length);
  for (const event of events) {
    for (const field of ['title', 'name', 'summary']) {
      assert.ok(eventText(event[field], 'en'));
      assert.ok(eventText(event[field], 'zh-CN'));
    }
  }
  const recap = events.find(event => event.status === 'recap');
  assert.equal(recap.date, null);
  assert.equal(recap.blocks.length, 0);
});

test('publication is default-off and only owners may change it on the server', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../../supabase/migrations/202609230002_events_publication.sql', import.meta.url), 'utf8');
  assert.match(sql, /values \(true, false\)/);
  assert.match(sql, /revoke all on public.events_settings from anon, authenticated/);
  assert.match(sql, /if not public.is_owner\(\) then raise exception/);
  assert.match(sql, /on public.library_display_submissions as restrictive/);
  assert.match(sql, /on storage.objects as restrictive/);
  assert.match(sql, /bucket_id <> 'library-display-photos' or public.can_access_events\(\)/);
});
