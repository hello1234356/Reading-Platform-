import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { searchBooksByQueryLanguage } from '../../lib/bookSearch';
import { applyBookModerationUpdate, moderateBookSearchResults } from '../../lib/bookModerationApi';
import BookCoverImage from '../BookCoverImage';
import BookModerationStatus from '../BookModerationStatus';

export default function ClubBookPicker({ value, onChange, showSelection = true }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(value?.title || '');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const request = useRef(0);
  useEffect(() => {
    const token = ++request.current;
    if (query.trim().length < 2 || query === value?.title) return;
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const result = await searchBooksByQueryLanguage(query.trim());
        if (request.current !== token) return;
        setResults(result.results);
        setStatus(result.results.length ? '' : 'empty');
        void result.startModeration((key, moderationStatus, details = {}) => {
          if (request.current === token) setResults(rows => rows.map(book => applyBookModerationUpdate(book, key, moderationStatus, details)));
        });
      } catch { if (request.current === token) setStatus('error'); }
    }, 500);
    return () => { clearTimeout(timer); request.current = token + 1; };
  }, [query, value?.title]);
  async function retry(book) {
    const token = request.current;
    try {
      await moderateBookSearchResults([book], (key, status, details = {}) => {
        if (token === request.current) setResults(current => current.map(row => applyBookModerationUpdate(row, key, status, details)));
      });
    } catch { if (token === request.current) setStatus('error'); }
  }
  return <div className="cr-book-picker">
    <label>{t('clubs.bookTitle')}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setResults([]); setStatus(''); }} placeholder={t('clubs.searchBook')} /></label>
    {showSelection && value && <p className="cr-selected-book">✓ {value.title} · {value.author}</p>}
    {status && <p role="status">{t(`clubRoom.search_${status}`)}</p>}
    <div className="book-search-suggestions">{results.map((book, index) => <div className="book-search-suggestion" key={book.moderationKey || index}>
      <button type="button" className="book-search-suggestion-select" disabled={book.moderationStatus !== 'approved'} onClick={() => { request.current++; onChange(book); setQuery(book.title); setResults([]); setStatus(''); }}>
        <BookCoverImage src={book.coverUrl} alt="" /><strong>{book.title}</strong><small>{book.author}</small>
      </button><BookModerationStatus book={book} onRetry={retry} />
    </div>)}</div>
  </div>;
}
