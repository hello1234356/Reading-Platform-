import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isClubChatAtLatest } from '../src/lib/clubReadVisibility.js';

const hookSource = await readFile(new URL('../src/components/clubs/useClubReadPosition.js', import.meta.url), 'utf8');
function readHarness() {
  const refs = [], writes = [], events = new Map(), timers = new Map();
  let hookIndex = 0, effects = [], cleanups = [], acknowledgements = 0, focused = true;
  const list = { current: { scrollHeight: 1600, scrollTop: 1000, clientHeight: 600 } };
  const ctx = {
    isClubChatAtLatest,
    useRef(value) { return refs[hookIndex++] ||= { current: value }; },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
    document: { visibilityState: 'visible', hasFocus: () => focused,
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    setInterval: fn => { timers.set(1, fn); return 1; }, clearInterval: id => timers.delete(id),
    markClubChannelRead: (...args) => new Promise((resolve, reject) => writes.push({ args, resolve, reject })),
  };
  vm.createContext(ctx);
  vm.runInContext(hookSource.replace(/^import .*;\n/gm, '').replace('export default ', ''), ctx);
  const props = { clubId: 1, channelId: 2, postId: 10, ready: true, list, onRead: () => acknowledgements++ };
  function render() {
    cleanups.forEach(fn => fn()); hookIndex = 0; effects = [];
    const acknowledge = ctx.useClubReadPosition(props);
    cleanups = effects.map(fn => fn());
    return acknowledge;
  }
  return { ctx, props, writes, events, timers, render,
    focus: value => { focused = value; }, acknowledgements: () => acknowledgements,
    cleanup: () => cleanups.forEach(fn => fn()) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('reads require latest, visible, focused chat; incoming messages read once and older history stays unread', async () => {
  const h = readHarness();
  h.props.list.current.scrollTop = 400;
  let acknowledge = h.render();
  assert.equal(h.writes.length, 0);
  h.props.list.current.scrollTop = 1000;
  h.ctx.document.visibilityState = 'hidden'; acknowledge();
  h.ctx.document.visibilityState = 'visible'; h.focus(false); acknowledge();
  assert.equal(h.writes.length, 0);
  h.focus(true); h.events.get('focus')(); acknowledge();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].args, [1, 2, 10]);
  h.writes[0].resolve(); await flush(); acknowledge();
  assert.equal(h.writes.length, 1); assert.equal(h.acknowledgements(), 1);
  h.props.postId = 11; acknowledge = h.render();
  assert.equal(h.writes.length, 2);
  h.writes[1].resolve(); await flush();
  h.props.list.current.scrollTop = 300; h.props.postId = 12; h.render();
  assert.equal(h.writes.length, 2);
  h.props.list.current.scrollTop = 1000; h.events.get('visibilitychange')();
  assert.equal(h.writes.length, 3);
  h.writes[2].resolve(); await flush();
  h.cleanup(); assert.equal(h.events.size, 0); assert.equal(h.timers.size, 0);
});

test('loading, older linked windows and dialogs cannot acknowledge; failed writes retry without clearing indicators', async () => {
  const h = readHarness(); h.props.ready = false;
  h.render(); h.timers.get(1)(); assert.equal(h.writes.length, 0);
  h.props.ready = true; h.render();
  h.writes[0].reject(Error('offline')); await flush();
  assert.equal(h.acknowledgements(), 0);
  h.timers.get(1)(); assert.equal(h.writes.length, 2);
  h.writes[1].resolve(); await flush();
  assert.equal(h.acknowledgements(), 1);
  h.cleanup();
});

const chatSource = await readFile(new URL('../src/components/clubs/ClubChat.jsx', import.meta.url), 'utf8');
function linkHarness(target) {
  const calls = [];
  const ctx = {
    cancelled: false, fetching: false, queued: false, initialized: false,
    targetMessageId: '20', club: { id: 1 }, channel: { id: 2 },
    newest: { current: null }, nearBottom: { current: true }, latestLoaded: { current: true }, targetPending: { current: true },
    t: value => value, mergeClubMessages: (a, b) => [...a, ...b],
    getChannelPost: async args => { calls.push(args); return target; },
    getChannelPosts: async args => { calls.push(args); return Array.from({ length: 50 }, (_, i) => ({ id: args.before ? i : i + 21 })); },
  };
  for (const key of ['HasLatest', 'HasOlder', 'Messages', 'TargetMissing', 'Unseen', 'Loading', 'Error']) {
    ctx['set' + key] = value => { ctx[key] = typeof value === 'function' ? value(ctx[key] || []) : value; };
  }
  vm.createContext(ctx);
  vm.runInContext(chatSource.slice(chatSource.indexOf('    async function refresh()'), chatSource.indexOf('    const client = requireSupabase();')), ctx);
  return { ctx, calls };
}
test('deep links request the scoped target and a bounded history window, retaining unread state until latest', async () => {
  const h = linkHarness({ id: 20 });
  await h.ctx.refresh();
  assert.equal(h.calls.length, 3);
  assert.deepEqual({ ...h.calls[0] }, { clubId: 1, channelId: 2, postId: '20' });
  assert.equal(h.ctx.Messages[50].id, 20);
  assert.equal(h.ctx.HasLatest, false); assert.equal(h.ctx.Loading, false);
  assert.equal(h.ctx.nearBottom.current, false);
  await h.ctx.refresh(); assert.equal(h.calls.length, 3); assert.equal(h.ctx.Unseen, true);
});
test('deleted mention links fall back to the correct channel latest history with an explanatory status', async () => {
  const h = linkHarness(null); await h.ctx.refresh();
  assert.equal(h.ctx.TargetMissing, true); assert.equal(h.ctx.targetPending.current, false);
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].channelId, 2);
  assert.equal(h.ctx.Messages.length, 50); assert.equal(h.ctx.Loading, false);
});
