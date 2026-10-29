import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
// Use the same historical club schema and seed data as the community migration test.
const base = await readFile(new URL('./club_community.mjs',import.meta.url),'utf8');
await db.exec(base.match(/await db.exec\(`([\s\S]+?)`\);/)[1]);
await db.exec(await readFile(new URL('../migrations/202610290001_club_community.sql',import.meta.url),'utf8'));
await db.exec(`create role service_role bypassrls; grant usage on schema public,auth to service_role;
 alter table profiles add column username text,add column full_name text,add column avatar_url text;
 update profiles set username='original_'||right(id::text,1);
`);
await db.exec(await readFile(new URL('../migrations/202610290002_club_member_profiles.sql',import.meta.url),'utf8'));
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function as(n,role='authenticated'){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[uid(n)]);await db.exec(`set role ${role}`);}
async function scalar(sql,args=[]){return Object.values((await db.query(sql,args)).rows[0])[0];}
async function save(club,user,nickname,tags){return db.query('select save_club_member_profile($1,$2,$3,$4::bigint[])',[club,uid(user),nickname,tags]);}
await as(1);
for(let i=1;i<=4;i++)await db.query('insert into club_member_tags(club_id,name) values(1,$1)',[`Tag ${i}`]);
await as(2);
await db.query('insert into club_member_tag_assignments values(1,$1,1)',[uid(2)]);
assert.equal(await scalar('select count(*)::int from club_members where nickname is null'),2);
await as(2);
await assert.rejects(()=>save(1,2,'Rejected direct RPC',[2]),/permission denied/);
assert.equal((await db.query("update club_members set nickname='Unmoderated' where club_id=1 returning user_id")).rows.length,0);
await assert.rejects(()=>db.query("insert into club_posts(club_id,user_id,message) values(1,$1,'Unmoderated')",[uid(2)]),/permission denied/);
await as(3);
await assert.rejects(()=>db.query("insert into club_members(club_id,user_id,nickname) values(1,$1,'Unmoderated')",[uid(3)]),/row-level security/);
await as(2,'service_role');
await save(1,2,'Moonreader',[1,2,3]);
assert.equal(await scalar('select nickname from club_members where club_id=1 and user_id=$1',[uid(2)]),'Moonreader');
assert.equal(await scalar('select username from profiles where id=$1',[uid(2)]),'original_2');
assert.equal(await scalar('select count(*)::int from club_member_tag_assignments'),3);
await assert.rejects(()=>save(1,2,'Bad edit',[999]),/Invalid member tags/);
assert.equal(await scalar('select nickname from club_members where user_id=$1',[uid(2)]),'Moonreader');
assert.equal(await scalar('select count(*)::int from club_member_tag_assignments'),3);
await assert.rejects(()=>save(1,2,'Too many',[1,2,3,4]),/Invalid member tags/);
await assert.rejects(()=>save(1,2,'Duplicates',[1,1]),/Invalid member tags/);
await assert.rejects(()=>save(1,3,'Non-member',[]),/Membership required/);
await assert.rejects(()=>save(1,2,'Host',[]),/Invalid nickname/);
await assert.rejects(()=>save(1,2,'hidden\u202ename',[]),/Invalid nickname/);
await assert.rejects(()=>save(1,2,'x'.repeat(31),[]),/club_nickname_length/);
await save(1,2,'Moonreader',[2,3,4]);
assert.deepEqual((await db.query('select tag_id::int from club_member_tag_assignments order by tag_id')).rows.map(row=>row.tag_id),[2,3,4]);
// Service actor comes only from the Edge function's verified JWT, never payload.userId.
await db.query("select publish_club_message(1,1,$1,'Approved general')",[uid(2)]);
await db.query("select publish_club_message(1,2,$1,'Approved spoiler')",[uid(2)]);
await assert.rejects(()=>db.query("select publish_club_message(1,1,$1,'Outsider')",[uid(3)]),/Membership required/);
await as(2);
assert.equal(await scalar("select count(*)::int from club_posts where message like 'Approved%'"),2);
await as(1);
await db.exec('reset role');
await db.query("insert into book_clubs(book_id,creator_id,title,description,duration,members_wanted,tags) values(1,$1,'Another','Description','4 weeks',3,'{}')",[uid(1)]);
await db.query('insert into club_members(club_id,user_id) values(2,$1)',[uid(1)]);
await db.query("insert into club_member_tags(club_id,name) values(2,'Other club')");
await as(2);
await db.query('insert into club_members(club_id,user_id) values(2,$1)',[uid(2)]);
await as(2,'service_role');
await save(2,2,'Elsewhere',[]);
await assert.rejects(()=>save(1,2,'Wrong club tag',[5]),/Invalid member tags/);
assert.equal(await scalar('select nickname from club_members where club_id=1 and user_id=$1',[uid(2)]),'Moonreader');
assert.equal(await scalar('select nickname from club_members where club_id=2 and user_id=$1',[uid(2)]),'Elsewhere');
await save(1,1,'Moonreader',[]); // Nicknames do not have global uniqueness constraints.
await save(1,2,'',[]);
assert.equal(await scalar('select nickname from club_members where club_id=1 and user_id=$1',[uid(2)]),null);
await as(3);
assert.equal(await scalar('select count(*)::int from club_member_tag_assignments'),0);
console.log('PASS: moderated server writes only, self-write guards, preserved memberships/tags, atomic profile saves, tag replacement/cross-club checks, nickname limits/identity, global profile isolation, both channels.');
await db.close();
