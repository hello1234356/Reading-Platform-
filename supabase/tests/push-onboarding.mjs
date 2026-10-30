import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; grant usage on schema auth to authenticated;
  create function auth.uid() returns uuid language sql as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
  create table public.profiles(id uuid primary key);
  create table public.desktop_push_subscriptions(id uuid primary key,user_id uuid,session_id uuid);
`);
await db.exec(await readFile(new URL('../migrations/202610300002_desktop_push_onboarding.sql',import.meta.url),'utf8'));
const ids = Array.from({length:8},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
for(const id of ids) await db.query('insert into profiles values($1)',[id]);
const identity=async id=>{await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id})]);};
const claim=async id=>(await db.query('select claim_desktop_push_invitation($1) as claimed',[id])).rows[0].claimed;
await identity(ids[0]);await db.exec('set role anon');
await assert.rejects(()=>claim(ids[0]),/permission denied/);
await db.exec('reset role');await db.exec('set role authenticated');
await assert.rejects(()=>claim(ids[1]),/Authentication required/);
const simultaneous=await Promise.all([claim(ids[0]),claim(ids[0])]);
assert.deepEqual(simultaneous.sort(),[false,true],'only one browser/tab can claim');
await db.query("select complete_desktop_push_invitation($1,'dismissed')",[ids[0]]);
assert.equal(await claim(ids[0]),false);
await identity(null);await assert.rejects(()=>claim(ids[0]),/Authentication required/);
await identity(ids[0]);assert.equal(await claim(ids[0]),false,'logout/login does not reset');
await assert.rejects(()=>db.query('delete from desktop_push_onboarding'),/permission denied/);
await assert.rejects(()=>db.query("update desktop_push_onboarding set outcome='presented'"),/permission denied/);
await assert.rejects(()=>db.query("select complete_desktop_push_invitation($1,'presented')",[ids[0]]),/Invalid invitation outcome/);
// Every exit is durable; independent accounts and newly created accounts get their own chance.
for (const [offset,outcome] of ['dismissed','dismissed','dismissed','enabled','denied'].entries()) {
  const id=ids[offset+1];await identity(id);
  assert.equal(await claim(id),true);
  await assert.rejects(()=>db.query("select complete_desktop_push_invitation($1,'dismissed')",[ids[0]]),/Authentication required/);
  await db.query('select complete_desktop_push_invitation($1,$2)',[id,outcome]);
  assert.equal(await claim(id),false);
  const visible=(await db.query('select user_id,outcome from desktop_push_onboarding')).rows;
  assert.deepEqual(visible,[{user_id:id,outcome}],'RLS reveals only the current account');
}
// A failed completion/offline dismissal cannot cause another prompt.
await identity(ids[6]);assert.equal(await claim(ids[6]),true);assert.equal(await claim(ids[6]),false);
// An enabled subscription on another device suppresses the invitation for this account.
await db.exec('reset role');
await db.query('insert into auth.sessions values($1,$2,null)',[ids[0],ids[7]]);
await db.query('insert into desktop_push_subscriptions values($1,$2,$3)',[ids[0],ids[7],ids[0]]);
await identity(ids[7]);await db.exec('set role authenticated');
assert.equal(await claim(ids[7]),false);
assert.equal((await db.query('select outcome from desktop_push_onboarding')).rows[0].outcome,'already_enabled');
await db.exec('reset role');await db.query('delete from desktop_push_subscriptions');
await db.exec('set role authenticated');assert.equal(await claim(ids[7]),false,'disabling notifications never resets onboarding');
await db.close();
console.log('PASS: account-scoped one-time claims, concurrent browsers, every completion outcome, refresh/login persistence, RLS privacy, ownership enforcement, offline completion, and existing subscriptions.');
