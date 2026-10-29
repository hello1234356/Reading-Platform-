import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
let handler, action = 'allow', rpcCalls = [], checks = [], authenticated = true, member = true, unavailable = false;
const actor = '00000000-0000-0000-0000-000000000002';
const originalDeno = globalThis.Deno, originalFetch = globalThis.fetch;
globalThis.Deno = { env: { get: key => ({ SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service' })[key] }, serve: fn => { handler = fn; } };
globalThis.__clubTestCreateClient = () => ({
 auth: { getUser: async () => ({ data: { user: authenticated ? { id: actor } : null }, error: null }) },
 from: () => { const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:member ? { user_id:actor,nickname:'Existing' } : null,error:null})};return query; },
 rpc: async (name,args) => { rpcCalls.push({name,args});return {data:{id:99},error:null}; },
});
globalThis.fetch = async (_url, options) => { checks.push(JSON.parse(options.body)); return new Response(JSON.stringify({ action, feedback:'Policy feedback' }),{status:unavailable ? 503 : 200}); };
let source = await readFile(new URL('../../supabase/functions/club-content/index.ts',import.meta.url),'utf8');
source=source.replace(/^import \{ createClient \}.*$/m,'const createClient = globalThis.__clubTestCreateClient;').replace("'./policy.ts'",JSON.stringify(new URL('../../supabase/functions/club-content/policy.ts',import.meta.url).href));
await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
async function invoke(payload) { return handler(new Request('https://fixture.invalid/club-content',{method:'POST',headers:{Authorization:'Bearer fixture-user','Content-Type':'application/json'},body:JSON.stringify({clubId:1,action:'message',channelId:1,text:'A reading thought',...payload})})); }
function reset(){action='allow';rpcCalls=[];checks=[];authenticated=true;member=true;unavailable=false;}
test('server refuses blocked/reported/unknown/unavailable decisions before publishing',async()=>{
 for(const decision of ['block','report','unknown']){reset();action=decision;const response=await invoke({});assert.ok(response.status>=400);assert.equal(rpcCalls.length,0);}
 reset();unavailable=true;assert.equal((await invoke({})).status,503);assert.equal(rpcCalls.length,0);
});
test('both channels use the same established moderation and verified actor',async()=>{
 for(const channelId of [1,2]){reset();assert.equal((await invoke({channelId,userId:'spoofed'})).status,200);assert.equal(checks[0].contextType,'club_message');assert.equal(rpcCalls[0].args.p_user_id,actor);assert.equal(rpcCalls[0].args.p_channel_id,channelId);}
});
test('warning requires explicit confirmation and is checked again',async()=>{
 reset();action='warn';assert.equal((await invoke({})).status,422);assert.equal(rpcCalls.length,0);
 assert.equal((await invoke({allowWarning:true})).status,200);assert.equal(checks.length,2);assert.equal(rpcCalls.length,1);
});
test('nickname changes share moderation; tag-only edits are atomic and keep identity',async()=>{
 reset();assert.equal((await invoke({action:'profile',nickname:'Moon',tagIds:[2,3],userId:'spoofed'})).status,200);
 assert.equal(checks[0].text,'Moon');assert.equal(rpcCalls[0].name,'save_club_member_profile');assert.equal(rpcCalls[0].args.p_user_id,actor);assert.deepEqual(rpcCalls[0].args.p_tag_ids,[2,3]);
 reset();assert.equal((await invoke({action:'profile',nickname:'Existing',tagIds:[1]})).status,200);assert.equal(checks.length,0);
 reset();action='block';assert.equal((await invoke({action:'profile',nickname:'Changed',tagIds:[]})).status,422);assert.equal(rpcCalls.length,0);
});
test('unauthenticated users and nonmembers cannot request a write',async()=>{
 reset();authenticated=false;assert.equal((await invoke({})).status,401);assert.equal(rpcCalls.length,0);
 reset();member=false;assert.equal((await invoke({})).status,403);assert.equal(checks.length,0);
});
test.after(()=>{globalThis.Deno=originalDeno;globalThis.fetch=originalFetch;delete globalThis.__clubTestCreateClient;});
