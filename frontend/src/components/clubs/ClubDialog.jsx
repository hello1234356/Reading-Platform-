import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
export default function ClubDialog({ title, onClose, children, className = '' }) {
  const ref = useRef();
  const { t } = useTranslation();
  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={ref} className={`cr-dialog ${className}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label={t('clubRoom.close')}>×</button></header>{children}
  </dialog>;
}
