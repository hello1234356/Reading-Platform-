import { requireSupabase } from './supabase.js';

export const PUSH_STATE_KEY = 'litshelf.desktopPush.browser.v1';
const PROMPT_KEY = 'litshelf.desktopPush.invitation.v1';
export const PUSH_SCOPE = '/desktop-push/';
export const PUSH_SCRIPT = '/desktop-push/sw.js';
const vapidKey = (import.meta.env || {}).VITE_WEB_PUSH_PUBLIC_KEY || '';
let registrationPromise;

export function desktopPushSupported(env = globalThis) {
  const nav = env.navigator;
  return Boolean(env.isSecureContext && nav?.serviceWorker && env.PushManager && env.Notification &&
    !/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') &&
    !(nav.platform === 'MacIntel' && nav.maxTouchPoints > 1));
}
export function readPushState() {
  try { return JSON.parse(localStorage.getItem(PUSH_STATE_KEY) || 'null'); } catch { return null; }
}
export function savePushState(value) {
  // Failure to persist a preference must not leave a browser subscribed without a way to disable it.
  localStorage.setItem(PUSH_STATE_KEY, JSON.stringify(value));
}
export function invitationDismissed() {
  try { return localStorage.getItem(PROMPT_KEY) === 'dismissed'; } catch { return true; }
}
export function dismissPushInvitation() {
  try { localStorage.setItem(PROMPT_KEY, 'dismissed'); } catch { /* No repeat invitation in storage-restricted browsers. */ }
}
export function pushConfigured() { return /^[A-Za-z0-9_-]{87}=?$/.test(vapidKey); }
export function applicationServerKey(value = vapidKey) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
}
export function preparePushWorker() {
  if (!registrationPromise) registrationPromise = (async () => {
    const existing = await navigator.serviceWorker.getRegistration(PUSH_SCOPE);
    // Never replace another feature's worker, including a worker that already controls the root scope.
    if (existing && existing.scope === new URL(PUSH_SCOPE, location.origin).href &&
      [existing.active, existing.waiting, existing.installing].some(worker => worker && worker.scriptURL !== new URL(PUSH_SCRIPT, location.origin).href)) throw new Error('Push worker scope is in use');
    const registration = await navigator.serviceWorker.register(PUSH_SCRIPT, { scope: PUSH_SCOPE });
    if (!registration.active) await new Promise((resolve, reject) => {
      const worker = registration.installing || registration.waiting;
      if (!worker) return reject(new Error('Push worker unavailable'));
      const timeout = setTimeout(() => reject(new Error('Push worker activation timed out')), 15000);
      const changed = () => {
        if (worker.state === 'activated') { clearTimeout(timeout); worker.removeEventListener('statechange', changed); resolve(); }
        if (worker.state === 'redundant') { clearTimeout(timeout); worker.removeEventListener('statechange', changed); reject(new Error('Push worker unavailable')); }
      };
      worker.addEventListener('statechange', changed); changed();
    });
    return registration;
  })().catch(error => { registrationPromise = undefined; throw error; });
  return registrationPromise;
}
export async function getOwnPushRegistration() {
  const registration = await navigator.serviceWorker.getRegistration(PUSH_SCOPE);
  return registration?.scope === new URL(PUSH_SCOPE, location.origin).href &&
    registration.active?.scriptURL === new URL(PUSH_SCRIPT, location.origin).href ? registration : null;
}
export async function setWorkerAccount(userId, registration) {
  const reg = registration || await navigator.serviceWorker.getRegistration(PUSH_SCOPE);
  if (!reg || reg.scope !== new URL(PUSH_SCOPE, location.origin).href || !reg.active || reg.active.scriptURL !== new URL(PUSH_SCRIPT, location.origin).href) return;
  await new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Push worker unavailable')); }, 5000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); event.data?.ok ? resolve() : reject(new Error('Push storage unavailable')); };
    reg.active.postMessage({ type: 'LITSHELF_PUSH_ACCOUNT', userId: userId || null }, [channel.port2]);
  });
}
export async function syncPushSubscription(userId, language, registration) {
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return null;
  const { data, error } = await requireSupabase().rpc('register_desktop_push', { p_subscription: sub.toJSON(), p_expected_user: userId, p_language: language?.startsWith('zh') ? 'zh' : 'en' });
  if (error) throw error;
  return { userId, id: data, enabled: true };
}
export async function removePushSubscription(state) {
  if (!state?.id) return;
  const { error } = await requireSupabase().rpc('remove_desktop_push', { p_id: state.id });
  if (error) throw error;
}
export async function touchPushPresence(state, tabId, route, inboxOpen, visible) {
  if (!state?.enabled || !state.id) return;
  const { error } = await requireSupabase().rpc('touch_desktop_push', { p_id: state.id, p_tab_id: tabId, p_route: route, p_visible: visible, p_inbox_open: inboxOpen });
  if (error) throw error;
}
