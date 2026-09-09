import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const inbox = await readFile(new URL('../src/components/NotificationInbox.jsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');

function inboxHarness() {
  const writes = [];
  const ctx = {
    items: [1, 2, 3].map(id => ({ id, isRead: false, itemKind: 'personal', targetUrl: `/post/${id}` })),
    count: 3, openRef: { current: false }, loadedRef: { current: true },
    confirmedReadRef: { current: new Set() },
    openingReadRef: { current: false }, readWriteRef: { current: null }, refreshVersionRef: { current: 0 },
    setItems(value) { ctx.items = value; },
    setUnreadCount(value) { ctx.count = typeof value === 'function' ? value(ctx.count) : value; },
    setOpen() {}, setMessage() {}, t: x => x, console,
    markNotificationsRead: async items => writes.push(items.map(x => x.id)),
    navigate: url => { ctx.destination = url; }, isExternalNotificationTarget: () => false,
    refresh: async () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(inbox.slice(inbox.indexOf('  function markLoadedRead('), inbox.indexOf('  async function markAll(')), ctx);
  return { ctx, writes };
}

test('opening acknowledges every loaded unread row once; later arrivals and clicks are independent', async () => {
  const { ctx, writes } = inboxHarness();
  ctx.togglePanel();
  assert.equal(ctx.count, 0);
  assert.ok(ctx.items.every(x => x.isRead));
  assert.equal(ctx.openRef.current, true);
  await ctx.readWriteRef.current;
  assert.deepEqual(Array.from(writes[0]), [1, 2, 3]);
  ctx.togglePanel(); ctx.togglePanel();
  await ctx.readWriteRef.current;
  assert.equal(writes.length, 1);
  ctx.items.push({ id: 4, isRead: false }); ctx.count = 1;
  await ctx.openNotification(ctx.items[0]);
  assert.equal(ctx.destination, '/post/1');
  assert.equal(ctx.count, 1);
  assert.equal(ctx.items[3].isRead, false);
  ctx.togglePanel();
  await ctx.readWriteRef.current;
  assert.deepEqual(Array.from(writes[1]), [4]);
});

test('failed batch persistence is reported and reconciled without retry loops', async () => {
  const { ctx } = inboxHarness();
  let errors = 0, refreshes = 0;
  ctx.console = { error: () => errors++ };
  ctx.refresh = () => refreshes++;
  ctx.markNotificationsRead = async () => { throw Error('offline'); };
  ctx.togglePanel();
  await ctx.readWriteRef.current;
  assert.equal(errors, 1);
  assert.equal(refreshes, 1);
  assert.equal(ctx.openRef.current, true);
});

function jumpHarness() {
  const nodes = new Map(), timers = new Map();
  let scrolls = 0, callback;
  const ctx = {
    feedLoading: false, targetPostId: '40', targetCommentId: '52', targetReplyId: '109',
    loadedTargetPostRef: { current: '40' }, location: { key: 'first' },
    notificationTargetHandledRef: { current: '' }, targetHighlightRef: { current: null },
    posts: [{ id: 40, comments: [{ id: 52 }, { id: 109, isReply: true }] }],
    expandedCommentPostIds: new Set(),
    setExpandedCommentPostIds: fn => { ctx.expandedCommentPostIds = fn(ctx.expandedCommentPostIds); },
    document: { body: {}, getElementById: id => nodes.get(id) },
    MutationObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() { callback = null; } },
    window: { matchMedia: () => ({ matches: false }), setTimeout: fn => { timers.set(1, fn); return 1; }, clearTimeout: id => timers.delete(id) },
  };
  const start = home.indexOf('    if (feedLoading || !targetPostId)');
  const end = home.indexOf('\n  }, [feedLoading', start);
  vm.createContext(ctx);
  vm.runInContext(`function jump() {${home.slice(start, end)}\n}`, ctx);
  function addNode(id) {
    const classes = new Set();
    nodes.set(id, { scrollIntoView(options) { assert.equal(options.block, 'center'); scrolls++; }, focus() {}, classList: { add: x => classes.add(x), remove: x => classes.delete(x) } });
    return classes;
  }
  return { ctx, addNode, timers, mutate: () => callback?.(), scrolls: () => scrolls };
}

test('async replies expand before scrolling, wait for DOM, highlight once, and clean up', () => {
  const h = jumpHarness();
  h.ctx.feedLoading = true; h.ctx.jump();
  assert.equal(h.ctx.expandedCommentPostIds.size, 0);
  h.ctx.feedLoading = false; h.ctx.jump();
  assert.ok(h.ctx.expandedCommentPostIds.has(40));
  const cleanup = h.ctx.jump();
  assert.equal(h.scrolls(), 0);
  const classes = h.addNode('reply-109'); h.mutate();
  assert.equal(h.scrolls(), 1);
  assert.ok(classes.has('notification-content-target'));
  cleanup(); h.ctx.jump();
  assert.equal(h.scrolls(), 1);
  h.timers.get(1)();
  assert.equal(classes.size, 0);
  h.ctx.location.key = 'second'; h.ctx.jump();
  h.ctx.location.key = 'first'; h.ctx.jump();
  assert.equal(h.scrolls(), 3);
});

test('post, comment, and deleted reply targets fall back safely', () => {
  for (const [comment, reply, expected] of [['', '', 'feed-post-40'], ['52', '', 'comment-52'], ['52', '999', 'comment-52'], ['999', '', 'feed-post-40']]) {
    const h = jumpHarness();
    h.ctx.targetCommentId = comment; h.ctx.targetReplyId = reply;
    h.ctx.expandedCommentPostIds.add(40);
    h.addNode(expected); h.ctx.jump();
    assert.equal(h.scrolls(), 1);
  }
  const h = jumpHarness(); h.ctx.posts = []; h.ctx.jump();
  assert.equal(h.scrolls(), 0);
});


test('first async inbox fetch marks its snapshot, subsequent fetches retain unread arrivals', async () => {
  const { ctx, writes } = inboxHarness();
  ctx.loadedRef.current = false;
  ctx.setStatus = () => {};
  ctx.getUnreadNotificationCount = async () => 3;
  ctx.getNotifications = async () => [1, 2, 3].map(id => ({ id, isRead: false }));
  vm.runInContext(inbox.slice(inbox.indexOf('  async function refresh('), inbox.indexOf('  useEffect(')), ctx);
  ctx.togglePanel();
  await ctx.refresh({ includeItems: true });
  assert.equal(ctx.count, 0);
  assert.ok(ctx.items.every(x => x.isRead));
  await ctx.readWriteRef.current;
  assert.equal(writes.length, 1);
  ctx.getUnreadNotificationCount = async () => 1;
  ctx.getNotifications = async () => [...ctx.items, { id: 4, isRead: false }];
  await ctx.refresh({ includeItems: true });
  assert.equal(ctx.count, 1);
  assert.equal(ctx.items[3].isRead, false);
  assert.equal(writes.length, 1);
});

test('batch API separates announcement IDs and personal IDs in one request, skipping read items', async () => {
  const api = await readFile(new URL('../src/lib/notificationApi.js', import.meta.url), 'utf8');
  const calls = [];
  const ctx = { requireSupabase: () => ({ rpc: async (...args) => { calls.push(args); return {}; } }) };
  vm.createContext(ctx);
  vm.runInContext(api.slice(api.indexOf('export async function markNotificationsRead')).replace('export ', ''), ctx);
  await ctx.markNotificationsRead([{ id: 'a', itemKind: 'personal' }, { id: 'b', itemKind: 'public_announcement' }, { id: 'c', isRead: true }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'mark_notifications_read');
  assert.deepEqual(Array.from(calls[0][1].p_notification_ids), ['a']);
  assert.deepEqual(Array.from(calls[0][1].p_announcement_ids), ['b']);
  await ctx.markNotificationsRead([{ id: 'a', isRead: true }]);
  assert.equal(calls.length, 1);
  const sql = await readFile(new URL('../../supabase/migrations/202609090001_mark_loaded_notifications_read.sql', import.meta.url), 'utf8');
  assert.match(sql, /recipient_id = auth.uid\(\) and not is_read/);
  assert.match(sql, /id = any\(p_notification_ids\)/);
  assert.match(sql, /id = any\(p_announcement_ids\)/);
  assert.match(sql, /on conflict \(announcement_id, user_id\) do nothing/);
});

test('off-page targets fetch full comments once; existing and deleted posts are safe', async () => {
  const api = await readFile(new URL('../src/lib/postApi.js', import.meta.url), 'utf8');
  for (const existsInFeed of [false, true]) {
    let targetRequests = 0;
    const target = { id: 40, comments: [{ id: 109 }] };
    const query = { select() { return this; }, order() { return this; }, in() { return this; }, eq() { return this; },
      range: async () => ({ data: existsInFeed ? [target] : [{ id: 41 }], count: 50 }),
      maybeSingle: async () => { targetRequests++; return { data: target }; },
    };
    const ctx = { requireSupabase: () => ({ from: () => query }), getBookIdsByTitle: async () => null,
      FEED_SELECT: '*', attachCommentLikes: async rows => rows, mapPost: row => row };
    vm.createContext(ctx);
    vm.runInContext(api.slice(api.indexOf('export async function getFeedPosts('), api.indexOf('export async function createPost(')).replace('export ', ''), ctx);
    const result = await ctx.getFeedPosts(null, { targetPostId: '40' });
    assert.equal(result.posts[0].comments[0].id, 109);
    assert.equal(targetRequests, existsInFeed ? 0 : 1);
    if (!existsInFeed) {
      query.maybeSingle = async () => ({ data: null });
      const deleted = await ctx.getFeedPosts(null, { targetPostId: '999' });
      assert.equal(deleted.posts.length, 1);
    }
  }
});


test('successful reads survive stale refetches, close/reopen, and realtime arrivals', async () => {
  const { ctx, writes } = inboxHarness();
  const stale = ctx.items.map(item => ({ ...item }));
  ctx.setStatus = () => {};
  ctx.getUnreadNotificationCount = async () => 4;
  ctx.getNotifications = async () => [...stale, { id: 4, itemKind: 'personal', isRead: false }];
  vm.runInContext(inbox.slice(inbox.indexOf('  async function refresh('), inbox.indexOf('  useEffect(')), ctx);
  ctx.togglePanel();
  await ctx.readWriteRef.current;
  ctx.togglePanel();
  await ctx.refresh();
  assert.ok(ctx.items.slice(0, 3).every(item => item.isRead));
  assert.equal(ctx.items[3].isRead, false);
  assert.equal(ctx.count, 1);
  ctx.togglePanel();
  await ctx.readWriteRef.current;
  assert.equal(writes.length, 2);
  assert.deepEqual(Array.from(writes[1]), [4]);
});

test('missing batch RPC falls back to existing durable read RPCs for exact IDs only', async () => {
  const api = await readFile(new URL('../src/lib/notificationApi.js', import.meta.url), 'utf8');
  const saved = [];
  const ctx = {
    requireSupabase: () => ({ rpc: async () => ({ error: { code: 'PGRST202' } }) }),
    markNotificationRead: async item => saved.push(item.id),
  };
  vm.createContext(ctx);
  vm.runInContext(api.slice(api.indexOf('export async function markNotificationsRead')).replace('export ', ''), ctx);
  await ctx.markNotificationsRead([{ id: 'a' }, { id: 'b', itemKind: 'public_announcement' }, { id: 'c', isRead: true }]);
  assert.deepEqual(saved, ['a', 'b']);
  ctx.requireSupabase = () => ({ rpc: async () => ({ error: { code: '42501' } }) });
  await assert.rejects(ctx.markNotificationsRead([{ id: 'd' }]));
  assert.deepEqual(saved, ['a', 'b']);
});

test('in-flight responses are discarded and realtime refresh waits for persistence', async () => {
  const { ctx } = inboxHarness();
  const stale = ctx.items.map(item => ({ ...item }));
  let resolveItems, resolveWrite, reads = 0;
  ctx.setStatus = () => {};
  ctx.getUnreadNotificationCount = async () => 3;
  ctx.getNotifications = () => {
    reads++;
    return new Promise(resolve => { resolveItems = resolve; });
  };
  ctx.markNotificationsRead = () => new Promise(resolve => { resolveWrite = resolve; });
  vm.runInContext(inbox.slice(inbox.indexOf('  async function refresh('), inbox.indexOf('  useEffect(')), ctx);
  const oldRefresh = ctx.refresh({ includeItems: true });
  await Promise.resolve();
  ctx.togglePanel();
  await Promise.resolve();
  const realtimeRefresh = ctx.refresh({ includeItems: true });
  resolveItems(stale);
  await oldRefresh;
  assert.ok(ctx.items.every(item => item.isRead));
  assert.equal(reads, 1);
  resolveWrite();
  await ctx.readWriteRef.current;
  await Promise.resolve();
  assert.equal(reads, 2);
  resolveItems(stale);
  await realtimeRefresh;
  assert.ok(ctx.items.every(item => item.isRead));
  assert.equal(ctx.count, 0);
});
