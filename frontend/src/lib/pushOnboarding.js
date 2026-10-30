import { requireSupabase } from './supabase.js';

export function canOfferPushInvitation({ userId, readyUserId, status, busy, pathname, permission }) {
  return Boolean(userId && userId === readyUserId && status === 'off' && !busy &&
    !/^\/login(?:\/|$)/.test(pathname) && ['default', 'granted'].includes(permission));
}

export async function claimPushInvitation(userId, client = requireSupabase()) {
  const { data, error } = await client.rpc('claim_desktop_push_invitation', { p_expected_user: userId });
  if (error) throw error;
  return data === true;
}
export async function completePushInvitation(userId, outcome, client = requireSupabase()) {
  const { error } = await client.rpc('complete_desktop_push_invitation', { p_expected_user: userId, p_outcome: outcome });
  if (error) throw error;
}

// Delay claiming until a visible, loaded page has rendered. Cancellation before
// the frame makes React StrictMode's initial effect replay safe. Only one request
// is made per mount; an uncertain/offline response must never show the invitation.
export function schedulePushInvitation({ claim, onClaimed, document: doc = document, window: win = window }) {
  let cancelled = false;
  let started = false;
  let frame;
  const attempt = () => {
    if (cancelled || started || doc.readyState !== 'complete' || doc.visibilityState !== 'visible' || doc.querySelector('dialog[open]')) return;
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(async () => {
      if (cancelled || started || doc.visibilityState !== 'visible' || doc.querySelector('dialog[open]')) return;
      started = true;
      try { if (await claim() && !cancelled) onClaimed(); } catch { /* Fail closed; manual inbox preferences remain available. */ }
    });
  };
  win.addEventListener('load', attempt);
  doc.addEventListener('visibilitychange', attempt);
  // Avoid stacking on an existing dialog during the initial visit.
  const observer = new win.MutationObserver(attempt);
  observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['open'], childList: true });
  attempt();
  return () => {
    cancelled = true; win.cancelAnimationFrame(frame);
    win.removeEventListener('load', attempt); doc.removeEventListener('visibilitychange', attempt); observer.disconnect();
  };
}
