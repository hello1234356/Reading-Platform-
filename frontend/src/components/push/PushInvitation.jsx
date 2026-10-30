import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './DesktopPush.css';

export default function PushInvitation({ anchorRef, onDismiss, onEnable }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, visibility: 'hidden' });
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const panel = ref.current;
      if (!anchor || !panel) return;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0;
      const top = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      setPosition({ left: Math.max(left + 12, Math.min(anchor.right - panel.offsetWidth, left + width - panel.offsetWidth - 12)),
        top: Math.max(top + 12, Math.min(anchor.bottom + 12, top + height - panel.offsetHeight - 12)), visibility: 'visible' });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.visualViewport?.removeEventListener('resize', place); };
  }, [anchorRef]);
  useEffect(() => {
    ref.current?.querySelector('.push-invitation-close')?.focus();
    const outside = event => { if (!ref.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) onDismiss(false); };
    const key = event => { if (event.key === 'Escape') { event.stopPropagation(); onDismiss(false); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [anchorRef, onDismiss]);
  return createPortal(<section ref={ref} style={position} className="push-invitation" id="push-invitation-panel" role="dialog" aria-labelledby="push-invitation-title" aria-describedby="push-invitation-description">
    <button type="button" className="push-invitation-close" aria-label={t('common.close')} onClick={() => onDismiss(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button>
    <div className="push-invitation-content"><img src="/branding/apple-touch-icon.png" alt="LitShelf" width="42" height="42" /><div><h2 id="push-invitation-title">{t('desktopPush.invitationTitle')}</h2><p id="push-invitation-description">{t('desktopPush.invitationBody')}</p></div></div>
    <div className="push-invitation-actions"><button type="button" className="ghost-button" onClick={() => onDismiss(true)}>{t('desktopPush.notNow')}</button><button type="button" className="primary-button" onClick={onEnable}>{t('desktopPush.enable')}</button></div>
  </section>, document.body);
}
