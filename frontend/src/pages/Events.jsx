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
import { getExhibitionEvents } from '../config/exhibitions';
import bookCatArt from '../assets/seasonal/halloween-book-cat.jpg';
import hauntedHouseArt from '../assets/seasonal/halloween-haunted-house.jpg';

const weekdayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function formatEventRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });

  if (sameMonth) {
    return `${monthFormatter.format(start)} ${start.getDate()} - ${end.getDate()}`;
  }

  return `${monthFormatter.format(start)} ${start.getDate()} - ${monthFormatter.format(end)} ${end.getDate()}`;
}

function buildMonthWeeks(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - first.getDay());
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));
  const weeks = [];

  while (cursor <= end) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      week.push({
        date: new Date(cursor),
        inMonth: cursor.getMonth() === monthIndex,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function getWeekSegments(week, events) {
  const weekStart = week[0].date;
  const weekEnd = week[6].date;

  return events
    .map((event) => {
      const eventStart = parseDate(event.startDate);
      const eventEnd = parseDate(event.endDate);

      if (eventEnd < weekStart || eventStart > weekEnd) return null;

      const segmentStart = eventStart > weekStart ? eventStart : weekStart;
      const segmentEnd = eventEnd < weekEnd ? eventEnd : weekEnd;

      return {
        event,
        gridColumn: `${segmentStart.getDay() + 1} / ${segmentEnd.getDay() + 2}`,
      };
    })
    .filter(Boolean);
}

function getLeadEvent(events) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return events.find((event) => parseDate(event.endDate) >= today) || events[0] || null;
}

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

function EventCalendar({ events, leadEvent, onSelect }) {
  const [firstEventDate, setMonth] = useState(() => leadEvent ? parseDate(leadEvent.startDate) : new Date());
  const moveMonth = (offset) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const year = firstEventDate.getFullYear();
  const monthIndex = firstEventDate.getMonth();
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(firstEventDate);
  const weeks = buildMonthWeeks(year, monthIndex);

  return (
    <section className="literary-calendar" aria-label={`${monthLabel} events calendar`}>
      <div className="events-section-title">
        <h2 aria-live="polite">{monthLabel}</h2>
        <div className="calendar-navigation">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button>
          <button type="button" onClick={() => setMonth(new Date())}>Today</button>
          <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}>›</button>
        </div>
      </div>
      <div className="calendar-board">
        <div className="calendar-weekdays">
          {weekdayLabels.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-weeks">
          {weeks.map((week) => (
            <div className="calendar-week" key={week[0].date.toISOString()}>
              <div className="calendar-days">
                {week.map((day) => (
                  <div
                    className={day.inMonth ? 'calendar-day' : 'calendar-day muted'}
                    key={day.date.toISOString()}
                  >
                    <time dateTime={day.date.toISOString().slice(0, 10)}>
                      {day.date.getDate()}
                    </time>
                  </div>
                ))}
              </div>
              <div className="calendar-events">
                {getWeekSegments(week, events).map(({ event, gridColumn }) => (
                  <button
                    type="button"
                    title={`${event.calendarTitle || event.title}: ${formatEventRange(event.startDate, event.endDate)}`}
                    aria-label={`${event.calendarTitle || event.title}: ${formatEventRange(event.startDate, event.endDate)}. View details`}
                    className={`calendar-event ${event.accentClass}`}
                    key={`${event.slug}-${gridColumn}-${week[0].date.toISOString()}`}
                    style={{ gridColumn }}
                    onClick={() => onSelect(event)}
                  >
                    <span className="calendar-event-symbol" aria-hidden="true">{event.calendarIcon || '✧'}</span>
                    <strong>{event.calendarTitle || event.title}</strong>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExhibitionEventDetail({ event }) {
  const top = useRef(null);

  useEffect(() => {
    top.current?.focus();
    window.scrollTo(0, 0);
  }, [event.slug]);

  return (
    <section className="events-page event-detail exhibition-event-detail">
      <Link className="event-link" to="/events">Back to Events</Link>
      <article>
        <header className={`event-detail-header exhibition-detail-header ${event.accentClass}`}>
          <p className="eyebrow">{event.subtitle}</p>
          <h1 ref={top} tabIndex={-1}>{event.title}</h1>
          <p>{event.description}</p>
          <div className="event-detail-meta">
            <span>{formatEventRange(event.startDate, event.endDate)}</span>
            <span>{event.location}</span>
          </div>
        </header>
        <div className="event-body exhibition-detail-body">
          <section>
            <h2>{event.participationTitle}</h2>
            <p>{event.participationText}</p>
            <Link className="event-button" to={event.formPath}>
              {event.ctaLabel} <span aria-hidden="true">→</span>
            </Link>
          </section>
        </div>
      </article>
    </section>
  );
}

function EventPopup({ event, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog ref={dialog} className="seasonal-event-dialog" aria-labelledby="seasonal-event-title"
      onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="seasonal-event-content">
        <button className="event-popup-close" type="button" aria-label="Close event details" onClick={onClose}>×</button>
        <img className="event-popup-art" src={hauntedHouseArt} alt="" />
        <p className="eyebrow">{event.subtitle}</p>
        <h2 id="seasonal-event-title">{event.title}</h2>
        <p className="event-popup-date">{formatEventRange(event.startDate, event.endDate)} · {event.location}</p>
        <p>{event.description}</p>
        <Link className="event-button" to={event.formPath}>{event.ctaLabel} →</Link>
      </div>
    </dialog>
  );
}

function EventsLanding({ events: exhibitionEvents }) {
  const featuredEvent = getLeadEvent(exhibitionEvents);
  const [selectedEvent, setSelectedEvent] = useState(null);

  return (
    <section className="events-page literary-events-page">
      <header className="events-heading literary-events-heading">
        <h1>Events</h1>
        <p>What's happening in the reading world</p>
      </header>
      {featuredEvent ? (
        <Link className={`event-announcement-banner ${featuredEvent.accentClass}`} to={featuredEvent.formPath}>
          <img className="event-announcement-art" src={bookCatArt} alt="" />
          <div>
            <h2>{featuredEvent.bannerTitle}</h2>
            <p>{featuredEvent.bannerText}</p>
            <span>{formatEventRange(featuredEvent.startDate, featuredEvent.endDate)}</span>
          </div>
          <strong>Recommend a Book <span aria-hidden="true">→</span></strong>
        </Link>
      ) : null}
      <EventCalendar events={exhibitionEvents} leadEvent={featuredEvent} onSelect={setSelectedEvent} />
      {selectedEvent && <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </section>
  );
}

function EventsContent() {
  const { eventSlug } = useParams();
  const { t, i18n } = useTranslation();
  const { user, loading } = useAuth();
  const local = value => eventText(value, i18n.resolvedLanguage);
  const exhibitionEvents = getExhibitionEvents();
  const exhibitionEvent = exhibitionEvents.find(item => item.slug === eventSlug);
  const event = events.find(item => item.slug === eventSlug);
  const top = useRef(null);
  useEffect(() => { if (eventSlug) { top.current?.focus(); window.scrollTo(0, 0); } }, [eventSlug]);
  if (exhibitionEvent) return <ExhibitionEventDetail event={exhibitionEvent} />;
  if (!event) return <EventsLanding events={exhibitionEvents} />;
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
