// Isolated PostgreSQL: executes the migrations and existing inbox RPCs, never hosted data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const read = file => readFile(new URL(file, import.meta.url), 'utf8');
const base = await read('./club_community.mjs');
await db.exec(base.match(/await db.exec\(`([\s\S]+?)`\);/)[1]);
await db.exec(`
 create role service_role bypassrls; grant usage on schema public,auth to service_role;
 alter table profiles add column username text,add column full_name text,add column avatar_url text;
 update profiles set username=case right(id::text,1) when '1' then 'Alice' when '2' then 'Bob (reader)' else 'Outsider' end;
 create table notifications(id uuid primary key default gen_random_uuid(),recipient_id uuid,actor_id uuid,type text,title text,body text,target_url text,target_type text,entity_type text,entity_id text,dedupe_key text unique,is_read boolean default false,created_at timestamptz default now(),post_id bigint,comment_id bigint,reply_id bigint);
 alter table notifications enable row level security;
 create policy self_notifications on notifications for select to authenticated using(recipient_id=auth.uid());
 grant select on notifications to authenticated;
 create table public_announcements(id uuid,title text,body text,target_url text,legacy_broadcast_id uuid,is_active boolean,starts_at timestamptz,ends_at timestamptz);
 create table public_announcement_reads(announcement_id uuid,user_id uuid,read_at timestamptz);
`);
for (const file of ['202610290001_club_community.sql', '202610290002_club_member_profiles.sql', '202610290003_club_mentions.sql']) {
  await db.exec(await read('../migrations/' + file));
}
const inboxSql = await read('../migrations/202608260004_public_announcements.sql');
for (const name of ['get_notification_inbox', 'get_unread_notification_count']) {
  await db.exec(inboxSql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0]);
}
const notificationSql = await read('../migrations/202608250005_notifications.sql');
await db.exec(notificationSql.match(/create or replace function public\.mark_notification_read\([\s\S]*?\$\$;/)[0]);
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
async function as(n) {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [uid(n)]);
  await db.exec('set role authenticated');
}
async function scalar(sql, args = []) { return Object.values((await db.query(sql, args)).rows[0])[0]; }
async function publish(channel, message, actor = 1) {
  await db.exec('reset role; set role service_role');
  const post = await scalar('select publish_club_message(1,$1,$2,$3)', [channel, uid(actor), message]);
  await db.exec('reset role');
  return post;
}
async function unread() { return (await db.query('select * from get_club_channel_unreads(1) order by channel_id')).rows; }
async function mark(channel, post) { await db.query('select mark_club_channel_read(1,$1,$2)', [channel, post.id]); }
function flags(rows) { return rows.map(row => [row.has_unread, row.has_mention]); }

// Existing mention data is enriched without replacing records or resetting read state.
const existing = await publish(1, 'Before this migration @Bob (reader)');
await db.exec('update notifications set is_read=true');
const oldNotification = await scalar('select id from notifications');
await db.exec(await read('../migrations/202610290004_club_channel_reads.sql'));
assert.equal(await scalar('select id from notifications'), oldNotification);
assert.equal(await scalar('select is_read from notifications'), true);
assert.equal(await scalar('select target_url from notifications'), `/clubs/1?channel=1&message=${existing.id}`);
await db.query("insert into notifications(recipient_id,actor_id,type,title,entity_type) values($1,$2,'reaction','Unrelated','post')", [uid(2), uid(1)]);
await as(2); await mark(1, existing);
assert.deepEqual(flags(await unread()), [[false, false], [false, false]]);

const ordinary = await publish(1, 'Ordinary general activity');
await as(2);
assert.deepEqual(flags(await unread()), [[true, false], [false, false]]);
assert.equal(await scalar('select count(*)::int from notifications'), 2);
const own = await publish(2, 'My own message', 2);
await as(2);
assert.deepEqual(flags(await unread()), [[true, false], [false, false]]);
await db.exec('reset role');
await db.query("update club_members set nickname='Moon' where user_id=$1", [uid(2)]);
// Duplicate trigger invocation simulates retrying the same notification write.
await db.exec('create trigger test_repeat_mention after insert on club_posts for each row execute function notify_club_mentions()');
const mention = await publish(1, 'Hi @Bob (reader), @Bob (reader)! @Alice');
const spoiler = await publish(2, 'SECRET ending @Bob (reader)');
await db.exec('drop trigger test_repeat_mention on club_posts');
await as(2);
assert.deepEqual(flags(await unread()), [[true, true], [true, true]]);
const inbox = (await db.query('select * from get_notification_inbox(30)')).rows;
assert.equal(inbox.length, 4);
const generalNotification = inbox.find(item => item.target_url.endsWith(`channel=1&message=${mention.id}`));
const spoilerNotification = inbox.find(item => item.target_url.endsWith(`channel=2&message=${spoiler.id}`));
assert.equal(generalNotification.actor.id, uid(1));
assert.equal(generalNotification.actor.username, 'Alice');
assert.equal(generalNotification.body, '#general · Original');
assert.equal(spoilerNotification.body, '#spoiler-zone · Original');
assert.ok(!JSON.stringify(inbox).includes('SECRET'));
assert.equal(await scalar('select get_unread_notification_count()'), 3);
// Inbox acknowledgements retain their existing semantics; they don't pretend the channel was visited.
await db.query('select mark_notification_read($1)', [generalNotification.id]);
assert.deepEqual(flags(await unread()), [[true, true], [true, true]]);
await mark(1, ordinary);
assert.deepEqual(flags(await unread()), [[true, true], [true, true]]);
await mark(1, mention);
assert.deepEqual(flags(await unread()), [[false, false], [true, true]]);
// Stale writes from another tab/device never regress the durable cursor.
await mark(1, ordinary);
assert.equal(String(await scalar('select last_read_post_id from club_channel_reads where channel_id=1')), String(mention.id));
await as(2); // A new session reads the same persisted position.
assert.deepEqual(flags(await unread()), [[false, false], [true, true]]);
await mark(2, spoiler);
assert.deepEqual(flags(await unread()), [[false, false], [false, false]]);
assert.equal(await scalar('select get_unread_notification_count()'), 1); // unrelated reaction preserved
assert.equal(await scalar("select is_read from notifications where type='reaction'"), false);
await mark(1, spoiler); // Cross-channel target rejected as a no-op.
assert.equal(String(await scalar('select last_read_post_id from club_channel_reads where channel_id=1')), String(mention.id));

// Timestamp ties use post ID, and timestamps retain PostgreSQL precision.
await db.exec('reset role');
const tiedA = await publish(1, 'First tie');
const tiedB = await publish(1, 'Second tie');
await db.query("update club_posts set created_at='2030-01-01 00:00:00.123456+00' where id=any($1::bigint[])", [[tiedA.id, tiedB.id]]);
await as(2); await mark(1, tiedA);
assert.equal((await unread())[0].has_unread, true);
await mark(1, tiedB);
assert.equal((await unread())[0].has_unread, false);
await mark(1, tiedA);
assert.equal(String(await scalar('select last_read_post_id from club_channel_reads where channel_id=1')), String(tiedB.id));
await assert.rejects(() => db.query('update club_channel_reads set last_read_post_id=1'), /permission denied/);
await assert.rejects(() => db.query('insert into club_channel_reads values(1,1,$1,now(),1)', [uid(1)]), /permission denied/);
await as(1);
assert.equal(await scalar('select count(*)::int from club_channel_reads'), 0);
await mark(2, own);
assert.equal(await scalar('select count(*)::int from club_channel_reads'), 1);
await as(3);
assert.deepEqual(await unread(), []);
assert.equal(await scalar('select count(*)::int from club_channel_reads'), 0);
await assert.rejects(() => mark(1, mention), /membership required/);
await db.exec("reset role; set role anon");
await assert.rejects(() => db.query('select * from get_club_channel_unreads(1)'), /permission denied/);
await assert.rejects(() => mark(1, mention), /permission denied/);

// Notices never notify; deleted-message links remain safe, bounded lookups.
await as(1);
await db.query("insert into club_announcements(club_id,author_id,body) values(1,$1,'Notice @Bob (reader)')", [uid(1)]);
await db.query('delete from club_posts where id=$1', [mention.id]);
await as(2);
assert.equal(await scalar('select count(*)::int from notifications'), 4);
assert.equal(await scalar('select count(*)::int from club_posts where club_id=1 and channel_id=1 and id=$1', [mention.id]), 0);
await mark(1, mention); // Deleted target leaves the existing cursor intact.
assert.equal(String(await scalar('select last_read_post_id from club_channel_reads where channel_id=1')), String(tiedB.id));
await db.exec('reset role');
assert.equal(await scalar('select count(*)::int from notifications where recipient_id=actor_id'), 0);
assert.equal(await scalar('select count(*)::int from notifications'), await scalar('select count(distinct dedupe_key)::int+1 from notifications'));
console.log('PASS: ordinary/mention priority, own messages, channel isolation, persisted/stale/tied cursors, RLS/write denial, existing inbox/counts/actors/deep links, nickname identity, spoiler-safe previews, duplicate trigger delivery, notices, deletion.');
await db.close();
