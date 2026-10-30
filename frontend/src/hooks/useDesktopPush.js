import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  desktopPushSupported, dismissPushInvitation, pushConfigured,
  preparePushWorker, readPushState, savePushState, setWorkerAccount, syncPushSubscription,
  removePushSubscription, touchPushPresence, applicationServerKey, getOwnPushRegistration,
} from '../lib/desktopPush';

export function useDesktopPush(userId, authLoading) {
  const { i18n } = useTranslation();
  const location = useLocation();
  const supported = desktopPushSupported();
  const configured = pushConfigured();
  const [status, setStatus] = useState('loading');
  const [readyUserId, setReadyUserId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const currentUser = useRef(userId);
  const operation = useRef(Promise.resolve());
  const tabId = useRef(null);
  const inboxRef = useRef(inboxOpen);
  useLayoutEffect(() => { currentUser.current = userId; inboxRef.current = inboxOpen; }, [userId, inboxOpen]);

  const reconcile = useCallback(() => {
    if (authLoading || !supported) return;
    // Serialize account transitions and mutations so late work cannot reactivate an old account.
    operation.current = operation.current.catch(() => {}).then(async () => {
      if (currentUser.current !== userId) return;
      const saved = readPushState();
      if (!userId || saved?.userId !== userId || !saved?.enabled) {
        await setWorkerAccount(null);
        if (currentUser.current === userId) setStatus(configured ? 'off' : 'unavailable');
        return;
      }
      if (Notification.permission !== 'granted') {
        await setWorkerAccount(null);
        await removePushSubscription(saved);
        savePushState({ ...saved, enabled: false });
        if (currentUser.current === userId) setStatus(Notification.permission === 'denied' ? 'denied' : 'off');
        return;
      }
      if (!configured) { setStatus('unavailable'); return; }
      const registration = await preparePushWorker();
      const state = await syncPushSubscription(userId, i18n.resolvedLanguage, registration);
      if (currentUser.current !== userId) return;
      if (state) {
        savePushState(state);
        await setWorkerAccount(userId, registration);
        setStatus('enabled');
      } else {
        await setWorkerAccount(null, registration);
        await removePushSubscription(saved);
        savePushState({ ...saved, enabled: false });
        setStatus('off');
      }
    }).then(() => { if (currentUser.current === userId) { setError(false); setReadyUserId(userId); } }).catch(() => { if (currentUser.current === userId) { setStatus('error'); setError(true); } });
  }, [userId, authLoading, supported, configured, i18n.resolvedLanguage]);

  useEffect(() => {
    reconcile();
    const onVisible = () => { if (document.visibilityState === 'visible') reconcile(); };
    window.addEventListener('focus', reconcile);
    window.addEventListener('storage', reconcile);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('focus', reconcile); window.removeEventListener('storage', reconcile); document.removeEventListener('visibilitychange', onVisible); };
  }, [reconcile]);

  useEffect(() => {
    if (status !== 'enabled' || !userId) return;
    if (!tabId.current) tabId.current = crypto.randomUUID();
    const route = location.pathname + location.search;
    const state = readPushState();
    const send = () => { void touchPushPresence(state, tabId.current, route, inboxRef.current, document.visibilityState === 'visible' && document.hasFocus()).catch(() => {}); };
    send();
    const timer = setInterval(send, 25000);
    document.addEventListener('visibilitychange', send);
    window.addEventListener('focus', send);
    window.addEventListener('blur', send);
    return () => {
      clearInterval(timer); document.removeEventListener('visibilitychange', send); window.removeEventListener('focus', send); window.removeEventListener('blur', send);
      void touchPushPresence(state, tabId.current, route, false, false).catch(() => {});
    };
  }, [status, userId, location.pathname, location.search, inboxOpen]);

  function enable() {
    if (!supported || !configured || !userId || busy) return Promise.resolve('cancelled');
    dismissPushInvitation();
    setBusy(true); setError(false);
    // This call must stay synchronous with the user's click, especially in Safari.
    let permission;
    try { permission = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission); }
    catch { setStatus('error'); setError(true); setBusy(false); return Promise.resolve('error'); }
    operation.current = operation.current.catch(() => {}).then(async () => {
      if (await permission !== 'granted') { setStatus(Notification.permission === 'denied' ? 'denied' : 'off'); return Notification.permission === 'denied' ? 'denied' : 'dismissed'; }
      if (currentUser.current !== userId) return 'cancelled';
      const registration = await preparePushWorker();
      const previous = readPushState();
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && previous?.userId !== userId) { await setWorkerAccount(null, registration); await subscription.unsubscribe(); subscription = null; }
      // Persist consent before remote writes; a failed remote write remains retryable in preferences.
      savePushState({ userId, enabled: true });
      if (!subscription) await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey() });
      const state = await syncPushSubscription(userId, i18n.resolvedLanguage, registration);
      if (currentUser.current !== userId) return 'cancelled';
      if (!state) throw new Error('Push subscription unavailable');
      savePushState(state);
      await setWorkerAccount(userId, registration);
      setStatus('enabled');
      return 'enabled';
    }).catch(() => { setStatus('error'); setError(true); return 'error'; }).finally(() => setBusy(false));
    return operation.current;
  }
  function disable() {
    if (busy) return Promise.resolve();
    setBusy(true); setError(false); dismissPushInvitation();
    operation.current = operation.current.catch(() => {}).then(async () => {
      const saved = readPushState();
      // Stop local display immediately, even if the server is temporarily unavailable.
      await setWorkerAccount(null);
      savePushState({ ...saved, enabled: false });
      const registration = await getOwnPushRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      await removePushSubscription(saved);
      setStatus('off');
    }).catch(() => { setStatus('error'); setError(true); }).finally(() => setBusy(false));
    return operation.current;
  }
  return { status: !supported ? 'unsupported' : Notification.permission === 'denied' ? 'denied' : status, busy, error, enable, disable, setInboxOpen, readyUserId };
}
