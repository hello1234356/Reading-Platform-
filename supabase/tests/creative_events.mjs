// Runs the actual migration in isolated PostgreSQL (PGlite), with only the
// existing LitShelf auth/profile/notification contracts stubbed. No hosted data.
import assert from 'node:assert/strict';
process.on('uncaughtException', error => { console.error(error.message,error.detail || '',error.where || '',error.internalQuery || '',error.stack?.split('\n').filter(line=>!line.includes('node_modules')).slice(0,5).join('\n'));process.exit(1); });
import { readFile, writeFile } from 'node:fs/promises';
async function fixture(name,value) { if(process.env.CREATIVE_FIXTURES_DIR) await writeFile(`${process.env.CREATIVE_FIXTURES_DIR}/${name}.json`,JSON.stringify(value)); }
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
  create function public.school_email_to_full_name(value text) returns text language sql immutable as
    $$ select initcap(replace(regexp_replace(split_part(value,'@',1),'_[0-9]{2}$',''),'.',' ')) $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
  create table public.profiles(id uuid primary key, full_name text, username text);
  create function public.is_admin() returns boolean language sql stable as
    $$ select coalesce(auth.uid()::text = '00000000-0000-0000-0000-000000000900',false) $$;
  create function public.is_owner() returns boolean language sql stable as $$ select public.is_admin() $$;
  create table public.events_settings(id boolean primary key, is_live boolean);
  insert into public.events_settings values(true,false);
  create table public.notifications(id uuid default gen_random_uuid(),recipient_id uuid,type text,title text,body text,target_url text,entity_type text,entity_id text,dedupe_key text unique);
`);
const migration = await readFile(new URL('../migrations/202610190001_creative_events.sql', import.meta.url),'utf8');
await db.exec(migration);
await db.exec(await readFile(new URL('../migrations/202610190002_marketplace_organizer_participation.sql', import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../migrations/202610190003_creative_roster_configuration.sql', import.meta.url),'utf8'));
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
for(const n of [...Array.from({length:16},(_,i)=>i+1),900]) {
 await db.query('insert into public.profiles values($1,$2,$3)',[uid(n),`Writer ${n}`,`writer${n}`]);
 await db.query('insert into auth.users(id,email) values($1,$2)',[uid(n),`writer${n}@example.test`]);
}
async function as(n,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)",[n ? uid(n) : '']);
  await db.exec(`set role ${role}`);
}
async function act(slug,action,payload={}) { await db.query('select public.creative_event_act($1,$2,$3::jsonb)',[slug,action,JSON.stringify(payload)]); }
async function state(slug='story-relay') { return (await db.query('select public.creative_event_state($1) as value',[slug])).rows[0].value; }
async function scalar(sql,args=[]) { return Object.values((await db.query(sql,args)).rows[0])[0]; }
async function denied(fn,pattern) { await assert.rejects(fn,pattern); }
const relay='story-relay', market='theme-marketplace';
await as(16);
assert.deepEqual(await scalar('select public.creative_event_list()'),[]);
await denied(()=>state(),/invitation only/);
await denied(()=>act(relay,'start'),/invitation only/);
await denied(()=>scalar('select public.creative_market_join()'),/Organizer access/);
await as(null,'anon');
await denied(()=>scalar('select public.creative_event_list()'),/permission denied/);
await denied(()=>scalar('select public.creative_market_join()'),/permission denied/);
await as(900);
await act(relay,'participants',{ids:Array.from({length:15},(_,i)=>uid(i+1))});
await act(market,'participants',{ids:[uid(1),uid(2),uid(3)]});
await act(relay,'settings',{startsAt:'2026-01-01T00:00:00+08:00',roundTwoAt:'2026-01-02T00:00:00+08:00',freeAt:'2099-01-03T00:00:00+08:00',revealAt:'2099-01-04T00:00:00+08:00',openingSentence:'The library door winked.'});
await act(relay,'start');
let s=await state(); assert.equal(s.queue.length,30); assert.equal(s.organizer,true);
await as(1);
assert.equal((await scalar('select public.get_events_access()')).hasCreativeInvite,true);
s=await state(); assert.equal(s.canWrite,true); assert.equal(s.previous,'The library door winked.'); assert.equal(s.story,null); assert.equal(s.openingSentence,null);
for(const table of ['creative_events','creative_participants','relay_turns','relay_sentences','theme_pitches','theme_votes']) await denied(()=>scalar(`select count(*) from public.${table}`),/permission denied/);
await denied(()=>scalar("select public.creative_advance('story-relay')"),/permission denied/);
await denied(()=>act(relay,'reveal'),/Organizer access/);
await denied(()=>act(relay,'submit',{sentence:'First. Second.',token:s.writeToken}),/exactly one sentence/);
await denied(()=>act(relay,'submit',{sentence:'一句。第二句。',token:s.writeToken}),/exactly one sentence/);
const oldToken=s.writeToken;
await act(relay,'submit',{sentence:'Dr. Li pocketed the key.',token:oldToken});
await denied(()=>act(relay,'submit',{sentence:'A duplicate.',token:oldToken}),/turn has changed/);
s=await state(); assert.equal(s.previous,null);assert.equal(s.story,null);assert.equal(s.queue.filter(t=>t.done).length,1);
await as(2);s=await state();assert.equal(s.previous,'Dr. Li pocketed the key.');
await db.exec('reset role');
await db.exec("update public.relay_turns set activated_at=now()-interval '25 hours' where user_id='00000000-0000-0000-0000-000000000002' and round=1");
await as(3);s=await state();assert.equal(s.canWrite,true);
let rest=s.queue.filter(t=>!t.done); assert.equal(rest[5].userId,uid(2));assert.equal(rest.length,29);
// Same turn receives one notification, even after repeated reads and reschedules.
await state();await state();await db.exec('reset role');
assert.equal(await scalar("select count(*)::integer from public.notifications where dedupe_key=$1",[`relay_turn:${rest[0].id}:${rest[0].userId}`]),1);
await as(900);
await denied(()=>act(relay,'reorder',{ids:[rest[0].id]}),/complete remaining queue/);
await denied(()=>act(relay,'close'),/Finish scheduled/);
await denied(()=>act(relay,'reorder',{ids:[...rest.map(t=>t.id).slice(0,-1),uid(999)]}),/complete remaining queue/);
// Replacing an invited writer revokes access while preserving both slots.
await act(relay,'replace-writer',{oldId:uid(15),newId:uid(16)});
await as(15);await denied(()=>state(),/invitation only/);
await as(16);s=await state();assert.equal(s.queue.filter(t=>t.userId===uid(16)).length,2);
// Complete all scheduled turns through the authenticated RPC.
for(let i=0;i<29;i++) {
  await as(900);s=await state();const turn=s.queue.find(t=>!t.done);
  await as(Number(turn.userId.slice(-12)));s=await state();
  assert.equal(s.canWrite,true);assert.equal(s.story,null);
  await act(relay,'submit',{sentence:`The secret grew stranger ${i}.`,token:s.writeToken});
}
s=await state();assert.equal(s.phase,'scheduled');assert.equal(s.queue.filter(t=>t.done).length,30);assert.equal(s.canClaim,false);
await as(900);
await act(relay,'settings',{startsAt:'2026-01-01T00:00:00+08:00',roundTwoAt:'2026-01-02T00:00:00+08:00',freeAt:'2026-01-03T00:00:00+08:00',revealAt:'2099-01-04T00:00:00+08:00',openingSentence:'The library door winked.'});
s=await state();assert.equal(s.phase,'scheduled');
await act(relay,'open-free');await as(1);s=await state();assert.equal(s.phase,'free');assert.equal(s.canClaim,true);
await act(relay,'claim');s=await state();const expired=s.writeToken;
await as(2);await denied(()=>act(relay,'claim'),/Another writer/);
await db.exec('reset role');await db.exec("update public.creative_events set claim_until=now()-interval '1 second' where slug='story-relay'");
await as(1);await denied(()=>act(relay,'submit',{sentence:'Too late.',token:expired}),/Claim a fresh/);
await as(2);await act(relay,'claim');s=await state();await act(relay,'submit',{sentence:'“Really?!”',token:s.writeToken});
await denied(()=>act(relay,'claim'),/Another writer/);
await as(900);await act(relay,'close');await denied(()=>act(relay,'reveal'),/unavailable/);
await act(relay,'settings',{startsAt:'2026-01-01T00:00:00+08:00',roundTwoAt:'2026-01-02T00:00:00+08:00',freeAt:'2026-01-03T00:00:00+08:00',revealAt:'2026-01-04T00:00:00+08:00',openingSentence:'The library door winked.'});
await act(relay,'reveal');await as(1);s=await state();assert.equal(s.story.length,31);assert.equal(s.openingSentence,'The library door winked.');
console.log('PASS: private discovery, table/RPC grants, hidden story, atomic stale-token rejection, 30 turns, deferral, notifications, free phase, claim expiry, reveal date');

await act(market,'pitch',{theme:'Between the lines',ideaOne:'The stories we leave out',ideaTwo:'A dictionary of silence'});
s=await state(market);const pitch1=s.pitches[0].id;
await as(2);assert.equal((await state(market)).pitches.length,0);
await act(market,'pitch',{theme:'Small wonders',ideaOne:'The museum in a pocket',ideaTwo:'Life at the margins'});
await as(1);await act(market,'pitch',{theme:'Between the lines',ideaOne:'Edited before voting',ideaTwo:'A dictionary of silence'});
await as(900);assert.equal((await state(market)).member,false);
await scalar('select public.creative_market_join()');await scalar('select public.creative_market_join()');
s=await state(market);assert.equal(s.member,true);assert.ok(s.participants.some(p=>p.id===uid(900)));assert.equal(new Set(s.participants.map(p=>p.id)).size,s.participants.length);
await act(market,'pitch',{theme:'New beginnings',ideaOne:'A first page',ideaTwo:'Ways to start again'});
await act(market,'open-voting');
await denied(()=>scalar('select public.creative_market_join()'),/Pitches are closed/);
await as(1);s=await state(market);assert.equal(s.pitches.length,3);assert.ok(s.pitches.every(p=>p.votes===null));
await denied(()=>act(market,'pitch',{theme:'Late',ideaOne:'Late',ideaTwo:'Late'}),/Pitches are closed/);
await act(market,'vote',{id:pitch1,delta:1});await act(market,'vote',{id:pitch1,delta:1});await act(market,'vote',{id:pitch1,delta:1});
await denied(()=>act(market,'vote',{id:s.pitches[1].id,delta:1}),/three votes/);
await act(market,'vote',{id:pitch1,delta:-1});
await as(2);s=await state(market);assert.ok(s.pitches.every(p=>p.votes===null && p.myVotes===0));
await as(900);assert.ok((await state(market)).pitches.every(p=>p.votes===null));await act(market,'close-voting');
await as(1);s=await state(market);assert.equal(s.pitches.find(p=>p.id===pitch1).votes,2);
await denied(()=>act(market,'vote',{id:pitch1,delta:-1}),/Voting is closed/);
await as(900);await denied(()=>act(market,'participants',{ids:[uid(1)]}),/participants are fixed/);
await db.exec('reset role');await db.query('delete from public.creative_participants where event_slug=$1 and user_id=$2',[market,uid(1)]);
await as(1);await denied(()=>state(market),/invitation only/);
console.log('PASS: organizer self-join without replacing invitations, private/editable pitches, phase locking, three-vote cap, hidden totals including organizer, closed results, invitation revocation');


// Roster correction: real accounts are matched, unknown people keep reserved
// slots, and no account is fabricated by a matching or confirmation RPC.
await db.exec('reset role');
await db.exec("delete from public.theme_votes; delete from public.theme_pitches; delete from public.relay_sentences; delete from public.relay_turns; delete from public.creative_participants; delete from public.creative_writer_slots; update public.creative_events set phase=case when kind='relay' then 'draft' else 'collecting' end,opening_sentence='',first_writer_id=null,second_writer_id=null,turns_per_writer=2");
const requested=['Carrie Wang','Yiru Yang','Maxim Jiang','Claire Yu','Leo Huo','Selina Xu','Albert Wang','Cecilia Yan','Yiyan Qiu','Nick Xu','Payson Dong','Eric Bin','Audrey Lee','Kristy Gai','Eason Pan'];
const missing=new Set([10,11,14,15]);
for(let n=1;n<=15;n++) if(!missing.has(n)) {
 await db.query('update public.profiles set full_name=$1 where id=$2',[requested[n-1],uid(n)]);
 await db.query('update auth.users set email=$1 where id=$2',[requested[n-1].toLowerCase().replace(' ','.')+'_28@tsinglan.org',uid(n)]);
}
await as(900);await act(market,'participants',{ids:[uid(16)]});
const matches=()=>scalar('select public.creative_match_writers(null)');
let proposed=await matches();
assert.deepEqual(proposed.map(row=>row.name),requested);
await fixture('roster-matches',proposed);
assert.equal(proposed[8].studentId,'T20281125');assert.equal(proposed[8].proposedId,uid(9));
assert.deepEqual(proposed.filter(row=>!row.proposedId).map(row=>row.name),['Nick Xu','Payson Dong','Kristy Gai','Eason Pan']);
await db.exec('reset role');await db.query('update public.profiles set full_name=$1 where id=$2',['Carrie Wang',uid(16)]);
await as(900);assert.equal((await matches())[0].proposedId,null);assert.equal((await matches())[0].status,'ambiguous');await fixture('roster-ambiguous',await matches());
await db.exec('reset role');await db.query('update public.profiles set full_name=$1 where id=$2',['Design member',uid(16)]);
await as(10);await denied(matches,/Organizer access/);await denied(()=>scalar('select count(*) from public.creative_writer_slots'),/permission denied/);
await as(null,'anon');await denied(matches,/permission denied/);
await as(900);proposed=await matches();
let slots=proposed.map(row=>({name:row.name,id:row.proposedId,studentId:row.studentId}));
const saveSlots=(rows,confirm=false)=>db.query('select public.creative_save_writer_slots($1::jsonb,$2)',[JSON.stringify(rows),confirm]);
await saveSlots(slots,true);s=await state();
await fixture('roster-draft',s);
assert.equal(s.rosterSlots.length,15);assert.equal(s.scheduledTotal,30);
assert.deepEqual(s.rosterSlots.slice(-4).map(row=>row.name),['Nick Xu','Payson Dong','Kristy Gai','Eason Pan']);
assert.equal(s.rosterSlots[0].id,uid(1));assert.equal(s.rosterSlots[1].id,uid(2));assert.equal(s.rosterSlots[8].id,uid(9));
assert.equal(s.rosterSlots.filter(row=>row.id===uid(9)).length,1);
assert.ok((await state(market)).participants.some(p=>p.id===uid(16)),'design members survive writer confirmation');
assert.equal((await state(market)).participants.filter(p=>p.id===uid(9)).length,1);
slots=s.rosterSlots;
await denied(()=>saveSlots([slots[1],slots[0],...slots.slice(2)]),/Keep Carrie/);
await denied(()=>saveSlots(slots.map((slot,index)=>index===3?{...slot,id:uid(9)}:slot)),/distinct existing/);
await denied(()=>act(relay,'start'),/opening sentence/);
const config={startsAt:'2026-01-01T00:00:00+08:00',roundTwoAt:'2026-01-02T00:00:00+08:00',freeAt:'2026-01-03T00:00:00+08:00',revealAt:'2026-01-04T00:00:00+08:00',openingSentence:'The window kept a secret.',turnsPerWriter:2};
await act(relay,'settings',config);await act(relay,'start');s=await state();
await fixture('roster-scheduled',s);
assert.equal(s.queue.length,30);assert.equal(s.queue.filter(t=>t.pendingAccount).length,8);
assert.ok(s.queue.slice(-8).every(t=>t.userId===null));
const knownOrder=slots.filter(slot=>slot.id).map(slot=>slot.id);
assert.deepEqual(s.queue.filter(t=>!t.pendingAccount).slice(0,11).map(t=>t.userId),knownOrder);
assert.deepEqual(s.queue.filter(t=>!t.pendingAccount).slice(11).map(t=>t.userId),knownOrder);
await as(1);s=await state();await act(relay,'submit',{sentence:'Carrie passed the secret on.',token:s.writeToken});
await as(900);s=await state();assert.equal(s.story[0].authorId,uid(1));assert.ok(s.story[0].createdAt);
await db.exec('reset role');await db.exec("update public.relay_turns set activated_at=now()-interval '25 hours' where user_id='00000000-0000-0000-0000-000000000002' and completed_at is null and round=1");
await as(3);s=await state();assert.equal(s.canWrite,true,'deferral works with eight pending-account turns');
await as(900);await act(relay,'pause');assert.equal((await state()).phase,'paused');
await as(3);await denied(()=>act(relay,'submit',{sentence:'Paused.',token:s.writeToken}),/closed/);
await as(900);await act(relay,'resume');assert.equal((await state()).phase,'scheduled');
// Configuration is not tied to 15 writers or two rounds.
await db.exec("begin; reset role; delete from public.relay_sentences; delete from public.relay_turns; update public.creative_events set phase='draft' where slug='story-relay'");
await as(900);await saveSlots(slots.slice(0,3));await act(relay,'settings',{...config,turnsPerWriter:3});await act(relay,'start');s=await state();assert.equal(s.queue.length,9);assert.equal(s.turnsPerWriter,3);assert.equal(s.queue.filter(t=>t.round===3).length,3);
await denied(()=>act(relay,'settings',{...config,turnsPerWriter:2}),/Turn count is fixed/);
await db.exec('rollback');await as(900);
while(true) {
 s=await state();const next=s.queue.find(t=>!t.done && !t.pendingAccount);if(!next)break;
 await as(Number(next.userId.slice(-12)));s=await state();await act(relay,'submit',{sentence:'Another writer added a twist.',token:s.writeToken});await as(900);
}
s=await state();assert.equal(s.queue.filter(t=>t.done).length,22);assert.equal(s.queue.length,30);assert.equal(s.phase,'scheduled');
assert.equal(s.story.filter(line=>line.authorId===uid(9)).length,2);
await denied(()=>act(relay,'open-free'),/Finish all scheduled/);
// Later, an organizer can bind pending slots to existing accounts. Prior text
// and authors remain untouched; all eight reserved turns are still present.
await db.exec('reset role');
let nextAccount=41;const pendingAccounts=new Map();
for(const name of ['Nick Xu','Payson Dong','Kristy Gai','Eason Pan']) {
 const id=uid(nextAccount++);pendingAccounts.set(name,id);
 await db.query('insert into public.profiles values($1,$2,$3)',[id,name,name.replace(' ','')]);
 await db.query('insert into auth.users(id,email) values($1,$2)',[id,name.toLowerCase().replace(' ','.')+'@example.test']);
}
await as(900);s=await state();await saveSlots(s.rosterSlots.map(slot=>slot.name==='Nick Xu'?{...slot,id:pendingAccounts.get(slot.name)}:slot));
await as(41);s=await state();assert.equal(s.canWrite,true);await act(relay,'submit',{sentence:'Nick arrived first.',token:s.writeToken});s=await state();assert.equal(s.canWrite,false,'one late account cannot immediately write its second turn');
await as(900);s=await state();await saveSlots(s.rosterSlots.map(slot=>({...slot,id:slot.id || pendingAccounts.get(slot.name)})));s=await state();assert.equal(s.queue.length,30);assert.equal(s.story.length,23);assert.equal(s.queue.filter(t=>t.pendingAccount).length,0);
while(s.queue.some(t=>!t.done)) {
 const next=s.queue.find(t=>!t.done);await as(Number(next.userId.slice(-12)));s=await state();await act(relay,'submit',{sentence:'The missing writer finally arrived.',token:s.writeToken});await as(900);s=await state();
}
await fixture('roster-finished',s);
assert.equal(s.story.length,30);assert.equal(s.phase,'scheduled','past target date does not auto-open free writing');
await as(9);await denied(()=>act(relay,'open-free'),/Organizer access/);
await as(900);await act(relay,'open-free');assert.equal((await state()).phase,'free');
await as(9);await act(market,'pitch',{theme:'Shared rooms',ideaOne:'Writing across departments',ideaTwo:'Designing the next chapter'});
await as(900);let pitch=(await state(market)).pitches.find(p=>p.authorId===uid(9));assert.equal(pitch.authorName,'Yiyan Qiu');assert.ok(pitch.createdAt);await fixture('market-authors',await state(market));
await act(market,'market-settings',{opensAt:null,closesAt:'2026-01-01T00:00:00+08:00'});assert.equal((await state(market)).submissionsOpen,false);
await as(9);await denied(()=>act(market,'pitch',{theme:'Closed',ideaOne:'Closed',ideaTwo:'Closed'}),/Pitches are closed/);
await as(900);await act(market,'market-settings',{opensAt:null,closesAt:null});assert.equal((await state(market)).submissionsOpen,true);
console.log('PASS: 15 named slots / 30 turns, Yiyan once in both events, four pending writers last, ambiguous matches unassigned, pinned first two, configurable 3×3 queue, pause/resume, pending-turn deferral and later resolution, manual free opening, story/pitch author IDs and timestamps, submission window');

// Apply the order correction to an already-linked draft, as on the hosted DB.
await db.exec('reset role');
await db.exec("delete from public.theme_votes; delete from public.theme_pitches; delete from public.relay_sentences; delete from public.relay_turns; delete from public.creative_participants; delete from public.creative_writer_slots; update public.creative_events set phase=case when kind='relay' then 'draft' else 'collecting' end,opening_sentence='',first_writer_id=null,second_writer_id=null,turns_per_writer=2");
for(let n=1;n<=15;n++) if(!missing.has(n)) {
  await db.query('update public.profiles set full_name=$1 where id=$2',[requested[n-1],uid(n)]);
  await db.query('update auth.users set email=$1 where id=$2',[requested[n-1].toLowerCase().replace(' ','.')+'_28@tsinglan.org',uid(n)]);
}
await as(900);
await saveSlots(requested.map((name,i)=>({name,id:missing.has(i+1)?null:uid(i+1)})),true);
await db.exec('reset role');
const usersBefore=await scalar('select count(*)::integer from auth.users');
await db.exec(await readFile(new URL('../migrations/202610200001_creative_profile_matching_order.sql',import.meta.url),'utf8'));
await as(900);
s=await state();
const corrected=['Yiru Yang','Leo Huo','Maxim Jiang','Claire Yu','Carrie Wang','Selina Xu','Albert Wang','Cecilia Yan','Yiyan Qiu','Nick Xu','Payson Dong','Eric Bin','Audrey Lee','Kristy Gai','Eason Pan'];
assert.deepEqual((await matches()).map(row=>row.name),corrected);
assert.deepEqual(s.rosterSlots.slice(0,5).map(row=>row.name),corrected.slice(0,5));
assert.deepEqual(s.rosterSlots.slice(-4).map(row=>row.name),['Nick Xu','Payson Dong','Kristy Gai','Eason Pan']);
assert.equal(s.firstWriterId,uid(2));assert.equal(s.secondWriterId,uid(5));
assert.deepEqual(s.rosterSlots.filter(row=>row.pinned).map(row=>row.name),['Yiru Yang','Leo Huo']);
assert.equal(s.scheduledTotal,30);
await denied(()=>saveSlots([s.rosterSlots[1],s.rosterSlots[0],...s.rosterSlots.slice(2)]),/Yiru Yang first and Leo Huo second/);
await db.exec('reset role');
await db.query('update public.profiles set full_name=$1,username=$2 where id=$3',['Different Student','AliasOnly Student',uid(16)]);
await db.query('update auth.users set email=$1 where id=$2',['emailonly.student_28@tsinglan.org',uid(16)]);
await as(900);
const noAliasProposals=await scalar('select public.creative_match_writers($1::jsonb)',[JSON.stringify([{name:'Emailonly Student'},{name:'AliasOnly Student'}])]);
assert.ok(noAliasProposals.every(row=>row.proposedId===null),'emails and usernames cannot automatically match a writer');
await db.exec('reset role');await db.query('update public.profiles set full_name=$1 where id=$2',['Yiru Yang',uid(16)]);
await as(900);assert.equal((await matches())[0].status,'ambiguous');assert.equal((await matches())[0].proposedId,null);
await fixture('profile-order-ambiguous',await matches());
await db.exec('reset role');await db.query('update public.profiles set full_name=$1 where id=$2',['Different Student',uid(16)]);
await as(900);proposed=await matches();await fixture('profile-order-matches',proposed);
assert.ok(proposed.filter(row=>row.proposedId).every(row=>row.candidates[0].evidence==='Profile full name'));
await saveSlots(proposed.map(row=>({name:row.name,id:row.proposedId,studentId:row.studentId})),true);
s=await state();await fixture('profile-order-draft',s);
await act(relay,'settings',config);await act(relay,'start');
await as(2);s=await state();assert.equal(s.canWrite,true);assert.equal(s.previous,config.openingSentence);
const first=s.queue.find(turn=>turn.current);assert.equal(first.name,'Yiru Yang');assert.equal(first.userId,uid(2));
await state();await db.exec('reset role');
assert.equal(await scalar('select count(*)::integer from public.notifications where dedupe_key=$1',[`relay_turn:${first.id}:${uid(2)}`]),1);
assert.equal(await scalar('select count(*)::integer from auth.users'),usersBefore);
await as(2);await act(relay,'submit',{sentence:'Yiru handed the secret to Leo.',token:s.writeToken});
await as(5);s=await state();assert.equal(s.canWrite,true);assert.equal(s.previous,'Yiru handed the secret to Leo.');
console.log('PASS: profiles.full_name-only proposals, duplicate-name confirmation, Yiru first / Leo second / Carrie fifth, four pending last, existing UUIDs preserved, opening settings, 30 turns and one first-turn notification');
await db.close();
