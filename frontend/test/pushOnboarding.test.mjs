import assert from 'node:assert/strict';
import test from 'node:test';
import { canOfferPushInvitation, claimPushInvitation, completePushInvitation, schedulePushInvitation } from '../src/lib/pushOnboarding.js';

const user = '00000000-0000-4000-8000-000000000001';
const eligible = {userId:user,readyUserId:user,status:'off',busy:false,pathname:'/',permission:'default'};
test('existing and new authenticated accounts share eligibility; login/loading/enabled/denied are excluded', () => {
  assert.equal(canOfferPushInvitation(eligible),true);
  assert.equal(canOfferPushInvitation({...eligible,userId:'new',readyUserId:'new'}),true);
  assert.equal(canOfferPushInvitation({...eligible,permission:'granted'}),true);
  for (const changes of [{userId:null},{readyUserId:null},{readyUserId:'other'},{pathname:'/login'},{pathname:'/login/recovery'},{status:'loading'},{status:'enabled'},{status:'unsupported'},{status:'unavailable'},{status:'error'},{busy:true},{permission:'denied'},{permission:undefined}]) {
    assert.equal(canOfferPushInvitation({...eligible,...changes}),false,JSON.stringify(changes));
  }
});
test('claim and completion use account-bound RPCs and fail closed on persistence errors', async () => {
  const calls=[];
  const client={rpc:async(name,params)=>{calls.push({name,params});return {data:true};}};
  assert.equal(await claimPushInvitation(user,client),true);
  await completePushInvitation(user,'dismissed',client);
  assert.deepEqual(calls,[{name:'claim_desktop_push_invitation',params:{p_expected_user:user}},{name:'complete_desktop_push_invitation',params:{p_expected_user:user,p_outcome:'dismissed'}}]);
  assert.equal(await claimPushInvitation(user,{rpc:async()=>({data:false})}),false);
  assert.equal(await claimPushInvitation(user,{rpc:async()=>({data:null})}),false);
  await assert.rejects(claimPushInvitation(user,{rpc:async()=>({error:Error('offline')})}));
});
function schedulerHarness() {
  const docListeners=new Map(),winListeners=new Map(),frames=new Map();
  let next=0,mutate=()=>{};
  const doc={readyState:'complete',visibilityState:'visible',body:{},dialog:false,querySelector:()=>doc.dialog,
    addEventListener:(name,fn)=>docListeners.set(name,fn),removeEventListener:name=>docListeners.delete(name)};
  const win={requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),
    addEventListener:(name,fn)=>winListeners.set(name,fn),removeEventListener:name=>winListeners.delete(name),
    MutationObserver:class {constructor(fn){mutate=fn;}observe(){}disconnect(){mutate=()=>{};}}};
  return {doc,win,frames,mutate:()=>mutate(),load:()=>winListeners.get('load')?.(),visible:()=>docListeners.get('visibilitychange')?.(),
    frame:async()=>{const batch=[...frames.values()];frames.clear();await Promise.all(batch.map(fn=>fn()));}};
}
test('onboarding waits for the loaded, visible interface and does not stack over another dialog', async () => {
  const h=schedulerHarness();let claims=0,shown=0;
  h.doc.readyState='loading';h.doc.visibilityState='hidden';
  const stop=schedulePushInvitation({document:h.doc,window:h.win,claim:async()=>{claims++;return true;},onClaimed:()=>shown++});
  await h.frame();assert.equal(claims,0);
  h.doc.readyState='complete';h.load();await h.frame();assert.equal(claims,0);
  h.doc.visibilityState='visible';h.doc.dialog=true;h.visible();await h.frame();assert.equal(claims,0);
  h.doc.dialog=false;h.mutate();await h.frame();assert.equal(claims,1);assert.equal(shown,1);
  h.mutate();h.visible();await h.frame();assert.equal(shown,1);
  stop();
});
test('StrictMode replay cancels the abandoned frame instead of consuming the account invitation', async () => {
  const h=schedulerHarness();let claims=0,shown=0;
  const options={document:h.doc,window:h.win,claim:async()=>{claims++;return true;},onClaimed:()=>shown++};
  schedulePushInvitation(options)();
  const stop=schedulePushInvitation(options);
  await h.frame();assert.equal(claims,1);assert.equal(shown,1);stop();
});
test('stale account responses, already-completed claims, and offline requests never show a modal', async () => {
  for (const claim of [async()=>false,async()=>{throw Error('offline');}]) {
    const h=schedulerHarness();let shown=0;
    const stop=schedulePushInvitation({document:h.doc,window:h.win,claim,onClaimed:()=>shown++});
    await h.frame();assert.equal(shown,0);stop();
  }
  const h=schedulerHarness();let resolve,shown=0;
  const stop=schedulePushInvitation({document:h.doc,window:h.win,claim:()=>new Promise(done=>{resolve=done;}),onClaimed:()=>shown++});
  const pending=h.frame();stop();resolve(true);await pending;assert.equal(shown,0);
});

// Exercise the existing enable workflow with fake browser/network dependencies;
// onboarding consumes its result without changing subscription/delivery behavior.
const { readFile } = await import('node:fs/promises');
const vm = await import('node:vm');
const hook = await readFile(new URL('../src/hooks/useDesktopPush.js',import.meta.url),'utf8');
function enableHarness(permissionResult = 'granted') {
  const calls=[];
  const context={supported:true,configured:true,userId:user,busy:false,currentUser:{current:user},operation:{current:Promise.resolve()},
    Notification:{permission:'default',requestPermission:()=>{calls.push('permission');context.Notification.permission=permissionResult;return Promise.resolve(permissionResult);}},
    dismissPushInvitation:()=>calls.push('local-marker'),setBusy:value=>{context.busy=value;},setError:value=>{context.error=value;},setStatus:value=>{context.status=value;},
    preparePushWorker:async()=>{calls.push('worker');return {pushManager:{getSubscription:async()=>null,subscribe:async()=>calls.push('subscribe')}};},
    readPushState:()=>null,savePushState:()=>calls.push('save'),applicationServerKey:()=>new Uint8Array(),
    syncPushSubscription:async()=>{calls.push('register');return {userId:user,id:'subscription',enabled:true};},
    setWorkerAccount:async()=>calls.push('account'),i18n:{resolvedLanguage:'en'},Promise,Error};
  vm.createContext(context);
  vm.runInContext(hook.slice(hook.indexOf('  function enable() {'),hook.indexOf('  function disable() {')),context);
  return {context,calls};
}
test('native permission remains click-driven and success waits for subscription registration', async () => {
  const {context,calls}=enableHarness();
  assert.equal(calls.length,0,'mounting/declaring the workflow does not request permission');
  const result=context.enable();
  assert.ok(calls.includes('permission'),'permission is requested synchronously in the click stack');
  assert.ok(!calls.includes('register'));
  assert.equal(await result,'enabled');
  assert.ok(calls.includes('register'));assert.ok(calls.includes('account'));assert.equal(context.status,'enabled');
});
test('denial/native dismissal exit cleanly without subscribing; failures remain retryable', async () => {
  for(const [permission,outcome] of [['denied','denied'],['default','dismissed']]) {
    const {context,calls}=enableHarness(permission);
    assert.equal(await context.enable(),outcome);assert.ok(!calls.includes('subscribe'));assert.equal(context.busy,false);
  }
  const {context}=enableHarness();
  const successfulRegister=context.syncPushSubscription;
  context.syncPushSubscription=async()=>{throw Error('offline');};
  assert.equal(await context.enable(),'error');assert.equal(context.status,'error');assert.equal(context.error,true);assert.equal(context.busy,false);
  context.syncPushSubscription=successfulRegister;
  assert.equal(await context.enable(),'enabled');assert.equal(context.error,false);
  const failedPermission=enableHarness();
  failedPermission.context.Notification.requestPermission=()=>{throw Error('Permission request failed');};
  assert.equal(await failedPermission.context.enable(),'error');assert.equal(failedPermission.context.busy,false);
});
