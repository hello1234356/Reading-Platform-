import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { displayPhotoUrl, getDisplaySubmissions, reviewDisplaySubmission } from '../lib/eventsApi';
import ProfileLink from './ProfileLink';
import '../pages/Events.css';
export default function LibraryDisplayAdmin() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]), [page, setPage] = useState(0), [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(null), [message, setMessage] = useState(''), [photo, setPhoto] = useState(null);
  useEffect(() => {
    let live = true;
    getDisplaySubmissions(page).then(data => { if (live) setRows(data); }).catch(() => { if (live) setError('loadError'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, reload]);
  function navigatePage(next) { setLoading(true); setError(''); setPhoto(null); setPage(next); }
  function refresh() { setLoading(true); setError(''); setPhoto(null); setReload(reload + 1); }
  async function review(row) {
    setBusy(row.id); setError(''); setMessage('');
    try {
      const status = row.status === 'pending' ? 'reviewed' : 'pending';
      await reviewDisplaySubmission(row.id, status);
      setRows(current => current.map(item => item.id === row.id ? { ...item, status } : item)); setMessage('saved');
    } catch { setError('failed'); } finally { setBusy(null); }
  }
  async function openPhoto(row) {
    setBusy(row.id); setError('');
    try { setPhoto({ id: row.id, url: await displayPhotoUrl(row.photo_path) }); }
    catch { setError('photoFailed'); } finally { setBusy(null); }
  }
  return <section className="admin-panel event-admin"><div className="event-actions"><h2>{t('events.review')}</h2><button disabled={loading || Boolean(busy)} onClick={refresh}>{t('events.refresh')}</button></div>
    {error && <p role="alert">{t(`events.${error}`)}</p>}<p role="status">{loading ? t('common.loading') : message ? t(`events.${message}`) : ''}</p>
    {!loading && !error && !rows.length && <p>{t('events.empty')}</p>}
    {!loading && rows.map(row => <article className="event-review-card" key={row.id}><span className="event-status">{t(`events.${row.status}`)}</span><h3><ProfileLink userId={row.student_id}>{row.student_name}</ProfileLink>{row.student_grade ? ` · ${row.student_grade}` : ''}</h3><time dateTime={row.created_at}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.created_at))}</time><h4>{row.book_title} — {row.book_author}</h4>{row.book_isbn && <small>ISBN {row.book_isbn}</small>}<blockquote>{row.quote}</blockquote><p className="event-prose">{row.reason}</p><div className="event-actions"><button disabled={Boolean(busy)} onClick={() => openPhoto(row)}>{t('events.photoOpen')}</button><button disabled={Boolean(busy)} onClick={() => review(row)}>{t(row.status === 'pending' ? 'events.mark' : 'events.reopen')}</button></div>{photo?.id === row.id && <figure><a href={photo.url} target="_blank" rel="noreferrer"><img className="event-admin-photo" src={photo.url} alt={row.student_name} /></a><figcaption><a href={photo.url} target="_blank" rel="noreferrer">{t('events.photoOpen')}</a></figcaption></figure>}</article>)}
    <div className="event-actions"><button disabled={page === 0 || loading || Boolean(busy)} onClick={() => navigatePage(page - 1)}>{t('events.previous')}</button><span>{page + 1}</span><button disabled={rows.length < 20 || loading || Boolean(busy)} onClick={() => navigatePage(page + 1)}>{t('events.next')}</button></div>
  </section>;
}
