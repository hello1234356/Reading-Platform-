// Runs the actual Edge handler with a fake Supabase/provider, real Web Push encryption,
// and ephemeral test-only keys. No requests leave this process.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createECDH } from 'node:crypto';
const { default: webpush } = await import(process.env.WEB_PUSH_MODULE || 'web-push');
const vapid = webpush.generateVAPIDKeys();
const client = createECDH('prime256v1'); client.generateKeys();
const id = '00000000-0000-4000-8000-000000000001';
const sub = {id,user_id:id,endpoint:'https://web.push.apple.com/test',p256dh:client.getPublicKey().toString('base64url'),auth_key:Buffer.alloc(16,7).toString('base64url'),language:'en',updated_at:'2026-10-30T00:00:00Z'};
const notification = {id,type:'mention',target_type:'club_message',target_url:'/clubs/1?channel=2&message=3',body:'Never send this private content'};
const job = {id,lease_token:id,attempts:1,notification_id:id};
let context = {subscription:sub,notification,actor_name:'Lana',presence:[]};
let handler, status = 201, fetches = 0;
const mutations=[];
const service={rpc:async(name)=>({data:name==='claim_desktop_push'?[job]:context}),from:table=>({
  update:values=>{const action={table,values,filters:[]};mutations.push(action);const chain={eq:(...args)=>{action.filters.push(args);return chain;},then:resolve=>resolve({error:null})};return chain;},
  delete:()=>{const action={table,delete:true,filters:[]};mutations.push(action);const chain={eq:(...args)=>{action.filters.push(args);return chain;},then:resolve=>resolve({error:null})};return chain;},
})};
const secrets={DESKTOP_PUSH_DISPATCH_SECRET:'test-dispatch-secret',VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'mailto:testing@example.com',SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
globalThis.Deno={serve:fn=>{handler=fn;},env:{get:name=>secrets[name]}};
globalThis.__pushTestClient=()=>service;
globalThis.__pushTestWebpush=webpush;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  fetches++;
  assert.equal(url,sub.endpoint); assert.equal(options.redirect,'error');
  assert.equal(options.headers['Content-Encoding'],'aes128gcm');
  assert.match(options.headers.Authorization,/^vapid t=/);
  assert.ok(options.body.length>100);
  assert.ok(!Buffer.from(options.body).includes(Buffer.from(notification.body)));
  return new Response(null,{status});
};
let source=await readFile(new URL('../functions/desktop-push/index.ts',import.meta.url),'utf8');
source=source.replace(/import \{ createClient \}[^;]+;/,"const createClient=globalThis.__pushTestClient;")
  .replace(/import webpush[^;]+;/,"const webpush=globalThis.__pushTestWebpush;")
  .replace("'./policy.js'",JSON.stringify(new URL('../functions/desktop-push/policy.js',import.meta.url).href));
await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const request=()=>new Request('https://test.invalid/functions/v1/desktop-push',{method:'POST',headers:{Authorization:'Bearer test-dispatch-secret'}});
assert.equal((await handler(new Request('https://test.invalid',{method:'POST'}))).status,401);
assert.equal(fetches,0);
assert.deepEqual(await (await handler(request())).json(),{sent:1,skipped:0,retry:0,failed:0});
assert.equal(mutations.at(-1).values.state,'sent');
assert.ok(mutations.at(-1).filters.some(([key])=>key==='lease_token'));
context={...context,presence:[{route:'/clubs/1?channel=2'}]};
await handler(request());assert.equal(fetches,1);assert.equal(mutations.at(-1).values.state,'skipped');
context={...context,presence:[]};
status=410;await handler(request());assert.equal(mutations.at(-1).delete,true);
status=429;await handler(request());assert.equal(mutations.at(-1).values.state,'pending');
status=403;await handler(request());assert.equal(mutations.at(-1).values.state,'failed');
context=null;await handler(request());assert.equal(mutations.at(-1).values.state,'skipped');
globalThis.fetch=originalFetch;
console.log('PASS: authenticated dispatch, real encrypted/VAPID request, private-content exclusion, presence suppression, lease-scoped writes, expired endpoint removal, transient retry, and terminal errors.');
