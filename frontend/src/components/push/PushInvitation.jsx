import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './DesktopPush.css';

export default function PushInvitation({ onDismiss, onEnable, onComplete }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const active = useRef(false);
  const enabling = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    active.current = true;
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { active.current = false; dialog.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);

  function enable() {
    if (enabling.current) return;
    enabling.current = true;
    setBusy(true); setFailed(false);
    // Call the existing flow directly in this click stack: Safari requires the
    // native permission request to retain the original user gesture.
    let result;
    try { result = onEnable(); } catch { result = Promise.resolve('error'); }
    Promise.resolve(result).then(outcome => {
      if (!active.current) return;
      if (outcome === 'enabled' || outcome === 'denied' || outcome === 'dismissed') onComplete(outcome);
      else setFailed(true);
    }).catch(() => { if (active.current) setFailed(true); }).finally(() => {
      enabling.current = false;
      if (active.current) setBusy(false);
    });
  }

  return createPortal(<dialog ref={ref} className="push-invitation" aria-labelledby="push-invitation-title" aria-describedby="push-invitation-description"
    onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <button type="button" className="push-invitation-close" aria-label={t('common.close')} onClick={onDismiss}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
    <img className="push-invitation-logo" src="/branding/litshelf-logo9.svg" alt="LitShelf" />
    <h2 id="push-invitation-title">{t('desktopPush.invitationTitle')}</h2>
    <p id="push-invitation-description">{t('desktopPush.invitationBody')}</p>
    {failed && <p className="push-invitation-error" role="alert">{t('desktopPush.enableFailed')}</p>}
    <div className="push-invitation-actions"><button type="button" className="ghost-button" onClick={onDismiss}>{t('desktopPush.notNow')}</button><button type="button" className="primary-button" disabled={busy} aria-busy={busy} onClick={enable}>{t('desktopPush.enable')}</button></div>
  </dialog>, document.body);
}
