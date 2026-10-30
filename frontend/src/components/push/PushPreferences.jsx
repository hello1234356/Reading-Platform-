import { useTranslation } from 'react-i18next';
import './DesktopPush.css';
export default function PushPreferences({ push }) {
  const { t } = useTranslation();
  const unavailable = ['unsupported','unavailable','loading','denied'].includes(push.status);
  const enabled = push.status === 'enabled';
  return <details className="push-preferences"><summary>{t('desktopPush.preferences')}</summary><div>
    <p role="status">{t(`desktopPush.${push.status}`)}</p>
    {push.error && <p role="alert">{t('desktopPush.failure')}</p>}
    {!unavailable && <button type="button" className="ghost-button" disabled={push.busy} onClick={enabled ? push.disable : push.enable}>{t(enabled ? 'desktopPush.disable' : 'desktopPush.enable')}</button>}
    {push.status === 'error' && <button type="button" className="ghost-button" disabled={push.busy} onClick={push.disable}>{t('desktopPush.disable')}</button>}
  </div></details>;
}
