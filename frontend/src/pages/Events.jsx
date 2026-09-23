import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { events, eventText } from '../data/events';
import { useAuth } from '../hooks/useAuth';
import { getUserProfile } from '../lib/profileApi';
import { searchCatalogBooks } from '../lib/communityBooks';
import { getMyDisplaySubmission, submitDisplayRecommendation, validDisplayPhoto } from '../lib/eventsApi';
import BookCoverImage from '../components/BookCoverImage';
import './Events.css';
import { useEventsAccess } from '../context/eventsAccess';
import EventsPublicationSwitch from '../components/EventsPublicationSwitch';

function LibraryForm({ user }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [receipt, setReceipt] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState('idle');
  const [book, setBook] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [quote, setQuote] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const submitting = useRef(false);
  const successRef = useRef(null);
  useEffect(() => {
    let live = true;
    Promise.all([getUserProfile(user.id), getMyDisplaySubmission(user.id)]).then(([p, s]) => {
      if (live) { setProfile(p); setReceipt(s); setReady(Boolean(p)); setLoadError(!p); }
    }).catch(() => { if (live) setLoadError(true); });
    return () => { live = false; request.current += 1; };
  }, [user.id, attempt]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (receipt) successRef.current?.focus(); }, [receipt]);
  async function search(e) {
    e.preventDefault();
    if (!query.trim()) return;
    const id = ++request.current;
    setSearchState('loading');
    try {
      const data = await searchCatalogBooks(query.trim(), 12);
      if (id === request.current) { setResults(data.results); setSearchState('done'); }
    } catch { if (id === request.current) setSearchState('error'); }
  }
  async function submit(e) {
    e.preventDefault();
    if (submitting.current) return;
    if (!book || !validDisplayPhoto(photo) || !quote.trim() || !reason.trim()) { setError('required'); return; }
    submitting.current = true; setBusy(true); setError('');
    try { setReceipt(await submitDisplayRecommendation({ userId: user.id, book, photo, quote, reason })); }
    catch { setError('failed'); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (loadError) return <div role="alert"><p>{t('events.profileError')}</p><button onClick={() => { setLoadError(false); setAttempt(attempt + 1); }}>{t('common.retry')}</button></div>;
  if (!ready) return <p role="status">{t('events.checking')}</p>;
  if (receipt) return <section className="event-confirmation" tabIndex={-1} ref={successRef}><p className="eyebrow">{t('events.review')}</p><h2>{t('events.success')}</h2><p>{t('events.successHelp')}</p><strong>{receipt.book_title}</strong><blockquote>{receipt.quote}</blockquote><p>{receipt.reason}</p></section>;
  return <section className="event-form">
    <h2>{t('events.formTitle')}</h2><p>{t('events.formIntro')}</p>
    <p className="event-identity">{t('events.student')}: <strong>{profile.full_name || profile.username}</strong>{profile.grade ? ` · ${profile.grade}` : ''}</p>
    {!book ? <form onSubmit={search} className="event-search"><label htmlFor="event-book-query">{t('events.search')}</label><p id="event-search-help">{t('events.searchHint')}</p><div className="event-search-row"><input id="event-book-query" value={query} onChange={e => setQuery(e.target.value)} required maxLength={200} aria-describedby="event-search-help" /><button disabled={searchState === 'loading'}>{t(searchState === 'loading' ? 'common.searching' : 'common.search')}</button></div>
      <div aria-live="polite">{searchState === 'error' && <p>{t('search.unavailable')}</p>}{searchState === 'done' && !results.length && <p>{t('events.noBooks')} <Link to="/discover">{t('events.discover')}</Link></p>}</div>
      <div className="event-book-results">{results.map(result => <button type="button" key={result.bookId} onClick={() => { setBook(result); setError(''); }}><BookCoverImage src={result.coverUrl} alt="" /><span><strong>{result.title}</strong><small>{result.author}</small></span></button>)}</div>
    </form> : <div className="event-selected"><BookCoverImage src={book.coverUrl} alt="" /><div><small>{t('events.selected')}</small><h3>{book.title}</h3><p>{book.author}</p><button disabled={busy} onClick={() => setBook(null)}>{t('events.change')}</button></div></div>}
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label htmlFor="event-photo">{t('events.photo')}</label><p id="event-photo-help">{t('events.photoHelp')}</p><input id="event-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="event-photo-help" required onChange={e => { const f = e.target.files?.[0]; setPhoto(null); setPreview(''); if (!f) return; if (!validDisplayPhoto(f)) { setError('photoError'); e.target.value = ''; return; } setPhoto(f); setPreview(URL.createObjectURL(f)); setError(''); }} />
      {preview && <img className="event-photo-preview" src={preview} alt={t('events.photo')} />}
      <label htmlFor="event-quote">{t('events.quote')} <small>{quote.length}/1000</small></label><textarea id="event-quote" required maxLength={1000} rows={4} value={quote} onChange={e => setQuote(e.target.value)} />
      <label htmlFor="event-reason">{t('events.reason')} <small>{reason.length}/800</small></label><textarea id="event-reason" required maxLength={800} rows={4} value={reason} onChange={e => setReason(e.target.value)} />
      <p className="event-privacy">{t('events.privacy')}</p>
      {error && <p role="alert" className="event-error">{t(`events.${error}`)}</p>}
      <button className="event-button" type="submit">{t(busy ? 'events.sending' : 'events.submit')}</button>
    </fieldset><p role="status">{busy ? t('events.sending') : ''}</p></form>
  </section>;
}

function EventsContent() {
  const { eventSlug } = useParams();
  const { t, i18n } = useTranslation();
  const { user, loading } = useAuth();
  const local = value => eventText(value, i18n.resolvedLanguage);
  const event = events.find(item => item.slug === eventSlug);
  const top = useRef(null);
  useEffect(() => { if (eventSlug) { top.current?.focus(); window.scrollTo(0, 0); } }, [eventSlug]);
  if (!event) return <section className="events-page"><header className="events-heading"><p className="eyebrow">{t('events.intro')}</p><h1>{t('events.title')}</h1><p>{t('events.subtitle')}</p></header><div className="events-grid">{events.map((item) => <article key={item.slug} className={`event-card event-card-${item.status}`}><span className={`event-status status-${item.status}`}>{t(`events.${item.status}`)}</span><p className="eyebrow">{local(item.name)}</p><h2>{local(item.title)}</h2><p>{local(item.summary)}</p><Link className={item.status === 'open' ? 'event-button' : 'event-link'} to={`/events/${item.slug}`}>{t(`events.${{ open: 'contribute', soon: 'explore', recap: 'read' }[item.status]}`)} <span aria-hidden="true">↗</span></Link></article>)}</div></section>;
  return <section className="events-page event-detail"><Link className="event-link" to="/events">{t('events.back')}</Link><article><header className={`event-detail-header event-card-${event.status}`}><span className={`event-status status-${event.status}`}>{t(`events.${event.status}`)}</span><p className="eyebrow">{local(event.name)}</p><h1 ref={top} tabIndex={-1}>{local(event.title)}</h1><p>{local(event.summary)}</p>{event.date && <time dateTime={event.date}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(event.date))}</time>}</header>
    <div className="event-body">{event.slug === 'library-book-display' ? <><p>{t('events.separate')}</p>{loading ? <p role="status">{t('common.loading')}</p> : user ? <LibraryForm key={user.id} user={user} /> : <><p>{t('events.formIntro')}</p><Link className="event-button" to="/login" state={{ from: `/events/${event.slug}` }}>{t('events.signIn')}</Link><p className="event-privacy">{t('events.privacy')}</p></>}</> : <>
      {event.blocks?.map((block, index) => <section key={index}>{block.heading && <h2>{local(block.heading)}</h2>}{block.text && <p className="event-prose">{local(block.text)}</p>}{block.image && <figure><img src={block.image} alt={local(block.alt)} loading="lazy" />{block.caption && <figcaption>{local(block.caption)}</figcaption>}</figure>}</section>)}
      {event.status === 'recap' && !event.blocks.length && <div className="event-editor-note"><h2>{t('events.pendingRecap')}</h2><p>{t('events.pendingCopy')}</p></div>}
      {event.bookQuery && <div className="event-actions"><Link className="event-button" to={`/discover?search=${encodeURIComponent(event.bookQuery)}`}>{t('events.book')}</Link><Link className="event-link" to={event.circleId ? `/clubs/${event.circleId}` : '/clubs'}>{t('events.circles')} →</Link></div>}
    </>}</div></article></section>;
}

export default function Events() {
  const { canView, loading, error, refresh } = useEventsAccess();
  const { t } = useTranslation();
  if (loading) return <section className="events-page" role="status">{t('common.loading')}</section>;
  if (error) return <section className="events-page"><p role="alert">{t('events.accessError')}</p><button onClick={refresh}>{t('common.retry')}</button></section>;
  if (!canView) return <Navigate to="/" replace />;
  return <><div className="events-publication-wrap"><EventsPublicationSwitch /></div><EventsContent /></>;
}
