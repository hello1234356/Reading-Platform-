import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEventsAccess } from '../context/eventsAccess';
export default function EventsPublicationSwitch() {
  const { t } = useTranslation();
  const { isLive, isAdmin, isOwner, setLive } = useEventsAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!isAdmin) return null;
  async function toggle() {
    setBusy(true); setError(false);
    try { await setLive(!isLive); } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <aside className="events-publication"><div><strong>{t(isLive ? 'events.live' : 'events.adminPreview')}</strong><p>{t(isOwner ? 'events.publishHelp' : 'events.ownerOnly')}</p></div>
    <button type="button" role="switch" aria-checked={isLive} aria-label={t('events.publishLabel')} disabled={!isOwner || busy} onClick={toggle} className="events-toggle"><span aria-hidden="true" />{t(busy ? 'events.savingVisibility' : isLive ? 'events.live' : 'events.hidden')}</button>
    {error && <p role="alert">{t('events.visibilityError')}</p>}
  </aside>;
}
