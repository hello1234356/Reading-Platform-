/* Dedicated push worker. No fetch/cache handlers and no root-scope takeover. */
const DB_NAME = 'litshelf-desktop-push-v1';
const ICON = '/branding/apple-touch-icon.png';
let tasks = Promise.resolve();
function serial(task) { const next = tasks.then(task, task); tasks = next.catch(() => {}); return next; }
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      const seen = request.result.createObjectStore('seen');
      seen.createIndex('timestamp', 'timestamp');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(stores, mode, run) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    run(tx, value => { result = value; });
  });
}
function activeAccount() {
  return transaction(['state'], 'readonly', (tx, done) => { tx.objectStore('state').get('userId').onsuccess = event => done(event.target.result); });
}
// Explicitly reject control characters in notification navigation.
/* eslint-disable no-control-regex */
function safeTarget(target) {
  return typeof target === 'string' && target.length <= 500 && !/[\\\s\u0000-\u001f]/.test(target) &&
    (/^\/(?:clubs(?:\/\d+)?|post\/\d+|discover|profile|events(?:\/[^/?#]+)?)(?:\?[^#]*)?$/.test(target) || target === '/?inbox=1') ? target : '/?inbox=1';
}
async function reserve(payload) {
  return transaction(['state','seen'], 'readwrite', (tx, done) => {
    const state = tx.objectStore('state');
    const seen = tx.objectStore('seen');
    state.get('userId').onsuccess = event => {
      if (event.target.result !== payload.recipientId) { done(false); return; }
      const key = `${payload.recipientId}:${payload.eventId}`;
      seen.get(key).onsuccess = event => {
        if (event.target.result) { done(false); return; }
        seen.put({ timestamp: Date.now() }, key);
        done(true);
      };
      const old = seen.index('timestamp').openCursor(IDBKeyRange.upperBound(Date.now() - 7 * 86400000));
      old.onsuccess = () => { if (old.result) { old.result.delete(); old.result.continue(); } };
    };
  });
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
// Deliberately do not claim or cache the site's pages.
self.addEventListener('message', event => {
  if (event.data?.type !== 'LITSHELF_PUSH_ACCOUNT') return;
  event.waitUntil(serial(async () => {
    try {
      const client = event.source?.id && await self.clients.get(event.source.id);
      if (!client || new URL(client.url).origin !== self.location.origin) throw new Error('Invalid sender');
      const userId = event.data.userId;
      if (userId !== null && !/^[0-9a-f-]{36}$/i.test(userId || '')) throw new Error('Invalid account');
      await transaction(['state'], 'readwrite', tx => tx.objectStore('state').put(userId, 'userId'));
      for (const notification of await self.registration.getNotifications()) {
        if (notification.data?.recipientId !== userId) notification.close();
      }
      event.ports[0]?.postMessage({ ok: true });
    } catch { event.ports[0]?.postMessage({ ok: false }); }
  }));
});
self.addEventListener('push', event => {
  event.waitUntil(serial(async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (payload?.version !== 1 || !/^(personal|announcement):[0-9a-f-]{36}$/i.test(payload.eventId || '') ||
      typeof payload.body !== 'string' || payload.body.length > 240 || !Number.isFinite(payload.timestamp) ||
      Date.now() - payload.timestamp > 86400000 || payload.timestamp > Date.now() + 300000) return;
    if (!await reserve(payload)) return;
    try {
      await self.registration.showNotification('LitShelf', {
        body: payload.body, icon: ICON, badge: ICON,
        tag: `litshelf:${payload.eventId}`, renotify: false,
        data: { recipientId: payload.recipientId, target: safeTarget(payload.target) },
      });
    } catch (error) {
      await transaction(['seen'], 'readwrite', tx => tx.objectStore('seen').delete(`${payload.recipientId}:${payload.eventId}`));
      throw error;
    }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(serial(async () => {
    const recipient = await activeAccount();
    const target = recipient && recipient === event.notification.data?.recipientId ? safeTarget(event.notification.data.target) : '/?inbox=1';
    const url = new URL(`/#${target}`, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      const navigated = await existing.navigate(url);
      if (navigated) { await navigated.focus(); return; }
    }
    await self.clients.openWindow(url);
  }));
});
