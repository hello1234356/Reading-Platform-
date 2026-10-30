import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { desktopPushSupported, applicationServerKey, dismissPushInvitation, invitationDismissed, savePushState, readPushState } from '../src/lib/desktopPush.js';
import { validPushEndpoint, pushBody, pushTarget, viewingTarget, eligibleNotification } from '../../supabase/functions/desktop-push/policy.js';

const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
test('desktop capability gate rejects insecure, mobile, iPad, and unsupported browsers', () => {
  const environment = { isSecureContext:true, navigator:{serviceWorker:{},userAgent:'Chrome',platform:'MacIntel',maxTouchPoints:0}, Notification:{},PushManager:{} };
  assert.equal(desktopPushSupported(environment), true);
  assert.equal(desktopPushSupported({...environment,isSecureContext:false}), false);
  assert.equal(desktopPushSupported({...environment,PushManager:null}), false);
  assert.equal(desktopPushSupported({...environment,navigator:{...environment.navigator,userAgent:'Android Chrome'}}), false);
  assert.equal(desktopPushSupported({...environment,navigator:{...environment.navigator,maxTouchPoints:5}}), false);
  assert.equal(applicationServerKey('B'+'A'.repeat(86)).length,65);
});
test('dismissal and current-browser preferences persist without any permission request', () => {
  const storage = new Map();
  globalThis.localStorage = {getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  let requests = 0;
  globalThis.Notification = {requestPermission:()=>requests++};
  assert.equal(invitationDismissed(),false);
  dismissPushInvitation();
  assert.equal(invitationDismissed(),true);
  savePushState({userId:id,id:other,enabled:false});
  assert.deepEqual(readPushState(),{userId:id,id:other,enabled:false});
  assert.equal(requests,0);
  delete globalThis.localStorage; delete globalThis.Notification;
});
test('push endpoint allowlist excludes SSRF destinations and deceptive authorities', () => {
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/token','https://web.push.apple.com/token','https://wns2.notify.windows.com/w/?token=x','https://updates.push.services.mozilla.com/wpush/v2/token']) assert.equal(validPushEndpoint(endpoint),true,endpoint);
  for (const endpoint of ['http://fcm.googleapis.com/token','https://127.0.0.1/token','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:8443/x','https://user:pass@web.push.apple.com/x','https://web.push.apple.com/x#fragment','file:///secret']) assert.equal(validPushEndpoint(endpoint),false,endpoint);
});
test('club triggers permit mentions only, exclude self events and respect read state', () => {
  const notification = {type:'mention',target_type:'club_message',recipient_id:id,actor_id:other};
  assert.equal(eligibleNotification(notification,id),true);
  for (const change of [{type:'club_message'},{type:'club_notice'},{target_type:'group_notice'},{actor_id:id},{recipient_id:other},{is_read:true}]) assert.equal(eligibleNotification({...notification,...change},id),false);
  assert.equal(eligibleNotification({type:'future_inbox_type'},id),true);
});
test('payload copy does not forward message excerpts, spoilers, titles, or announcement content', () => {
  for (const type of ['mention','reply','comment','reaction','book_submission_approved','book_submission_rejected','admin_announcement','future']) {
    const notification = {type,target_type:'club_message',title:'Private title',body:'Spoiler and private message'};
    const text = pushBody(notification,'Lana');
    assert.doesNotMatch(text,/Private|Spoiler|private message/);
    assert.ok(pushBody(notification,'Lana','zh'));
  }
  assert.equal(pushBody({type:'mention',target_type:'club_message'},'Lana'),'Lana mentioned you in a club.');
});
test('routing preserves exact social and club destinations and keeps untrusted links in the inbox', () => {
  assert.equal(pushTarget({post_id:3,comment_id:4,reply_id:5}),'/post/3?comment=4&reply=5');
  assert.equal(pushTarget({target_url:'/clubs/7?channel=8&message=9'}),'/clubs/7?channel=8&message=9');
  for (const target_url of ['https://example.com','//example.com','/\\example.com','javascript:alert(1)','/clubs/3#//evil']) assert.equal(pushTarget({target_url}),'/?inbox=1');
});
test('visible relevant content suppresses dispatch, while other clubs/channels/items do not', () => {
  assert.equal(viewingTarget({route:'/clubs/7?channel=8'},'/clubs/7?channel=8&message=9'),true);
  assert.equal(viewingTarget({route:'/clubs/7?channel=6'},'/clubs/7?channel=8&message=9'),false);
  assert.equal(viewingTarget({route:'/clubs/7'},'/clubs/7?channel=8&message=9'),false);
  assert.equal(viewingTarget({route:'/post/3'},'/post/3?comment=4'),false);
  assert.equal(viewingTarget({route:'/post/3?comment=4'},'/post/3?comment=4'),true);
  assert.equal(viewingTarget({inbox_open:true},'/?inbox=1'),true);
  assert.equal(viewingTarget({route:'/'},'/?inbox=1'),false);
});

const workerSource = await readFile(new URL('../public/desktop-push/sw.js',import.meta.url),'utf8');
function workerHarness() {
  const handlers = {}, shown = [], navigated = [];
  const stores = {state:new Map([['userId',id]]),seen:new Map()};
  const context = vm.createContext({URL,Date,Promise,IDBKeyRange:{upperBound:()=>null},self:{
    location:{origin:'https://litshelf.test'},
    addEventListener:(name,handler)=>{handlers[name]=handler;},
    registration:{showNotification:async(title,options)=>shown.push({title,...options}),getNotifications:async()=>[]},
    clients:{get:async()=>({url:'https://litshelf.test/'}),matchAll:async()=>[],openWindow:async url=>navigated.push(url)},
  }});
  vm.runInContext(workerSource,context);
  // Exercise worker event handlers with a deterministic transactional store, independent of browser APIs.
  context.transaction = async (_names,_mode,run) => {
    let result;
    const request = value => {const req={};queueMicrotask(()=>req.onsuccess?.({target:{result:value}}));return req;};
    run({objectStore:name=>({get:key=>request(stores[name].get(key)),put:(value,key)=>stores[name].set(key,value),delete:key=>stores[name].delete(key),index:()=>({openCursor:()=>request(null)})})},value=>{result=value;});
    await new Promise(resolve=>setImmediate(resolve));
    return result;
  };
  const dispatch = (name,extras) => {let work;handlers[name]({...extras,waitUntil:promise=>{work=promise;}});return work;};
  const payload = {version:1,recipientId:id,eventId:`personal:${other}`,title:'untrusted title',body:'Lana mentioned you in a club.',target:'/clubs/7?channel=8&message=9',timestamp:Date.now()};
  return {context,stores,shown,navigated,payload,dispatch,push:(value=payload)=>dispatch('push',{data:{json:()=>value}})};
}
test('worker displays branded push once across duplicate arrivals and never for another account', async () => {
  const h=workerHarness();
  await Promise.all([h.push(),h.push()]);
  assert.equal(h.shown.length,1);
  assert.equal(h.shown[0].title,'LitShelf');
  assert.equal(h.shown[0].icon,'/branding/apple-touch-icon.png');
  assert.equal(h.shown[0].renotify,false);
  await h.push({...h.payload,recipientId:other,eventId:`personal:${id}`});
  assert.equal(h.shown.length,1);
  assert.equal(h.stores.seen.size,1);
});
test('logout stops pending display, expired pushes are ignored, and failed display can retry', async () => {
  const h=workerHarness();
  await h.dispatch('message',{data:{type:'LITSHELF_PUSH_ACCOUNT',userId:null},source:{id:'tab'},ports:[{postMessage:()=>{}}]});
  await h.push(); assert.equal(h.shown.length,0);
  h.stores.state.set('userId',id);
  await h.push({...h.payload,timestamp:Date.now()-2*86400000}); assert.equal(h.shown.length,0);
  h.context.self.registration.showNotification=async()=>{throw Error('OS unavailable');};
  await assert.rejects(h.push());
  assert.equal(h.stores.seen.size,0);
  h.context.self.registration.showNotification=async()=>h.shown.push('retry');
  await h.push(); assert.equal(h.shown.length,1);
});
test('notification click opens the relevant hash route, with safe fallback after account switch', async () => {
  const h=workerHarness();
  await h.push();
  await h.dispatch('notificationclick',{notification:{data:h.shown[0].data,close:()=>{}}});
  assert.equal(h.navigated[0],'https://litshelf.test/#/clubs/7?channel=8&message=9');
  h.stores.state.set('userId',other);
  await h.dispatch('notificationclick',{notification:{data:h.shown[0].data,close:()=>{}}});
  assert.equal(h.navigated[1],'https://litshelf.test/#/?inbox=1');
});
