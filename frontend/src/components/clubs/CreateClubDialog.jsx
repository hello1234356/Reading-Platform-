import { useTranslation } from 'react-i18next';
import BookCoverImage from '../BookCoverImage';
import ClubDialog from './ClubDialog';
import ClubBookPicker from './ClubBookPicker';
import ClubScheduleEditor from './ClubScheduleEditor';
import './CreateClubDialog.css';

export default function CreateClubDialog({ draft, onChange, book, onBookChange, onSubmit, onClose, busy, error }) {
  const { t } = useTranslation();
  const field = (name, value) => onChange(current => ({ ...current, [name]: value }));
  const tags = draft.tagsText.split(',').map(tag => tag.trim()).filter(Boolean);
  const circleName = draft.clubName.trim() || (book ? t('clubs.defaultCircleName', { title: book.title }) : t('clubs.previewName'));
  const source = book?.source === 'google_books' ? 'Google Books' : book?.source === 'open_library' ? 'Open Library' : t('clubs.librarySource');

  return <ClubDialog title={t('clubs.createClubButton')} onClose={onClose} className="cc-dialog">
    <form onSubmit={onSubmit} className="cc-form">
      <div className="cc-layout">
        <div className="cc-editor" role="region" aria-label={t('clubs.createClubButton')} tabIndex={0}>
          {error && <p role="alert" className="cr-error">{error}</p>}
          <section className="cc-section" aria-labelledby="cc-book-heading">
            <h3 id="cc-book-heading"><span>01</span>{t('clubs.chooseReading')}</h3>
            <ClubBookPicker value={book} onChange={onBookChange} showSelection={false} />
          </section>
          <section className="cc-section" aria-labelledby="cc-details-heading">
            <h3 id="cc-details-heading"><span>02</span>{t('clubs.shapeCircle')}</h3>
            <label>{t('clubs.bookClubName')}<input value={draft.clubName} onChange={e => field('clubName', e.target.value)} /></label>
            <div className="cc-field-pair">
              <label>{t('clubs.membersWanted')}<input type="number" min="2" max="40" required value={draft.membersWanted} onChange={e => field('membersWanted', e.target.value)} /></label>
              <label>{t('clubs.duration')}<input value={draft.duration} onChange={e => field('duration', e.target.value)} placeholder={t('clubs.durationPlaceholder')} /></label>
            </div>
            <label>{t('clubs.description')}<textarea maxLength={350} rows={2} value={draft.description} onChange={e => field('description', e.target.value)} /></label>
            <div className="cc-description-meta"><span>{draft.description.length}/350</span></div>
            <label>{t('clubs.tags')}<input value={draft.tagsText} onChange={e => field('tagsText', e.target.value)} placeholder={t('clubs.tagsPlaceholder')} /></label>
            <small className="cc-hint">{t('clubs.tagsHint')}</small>
          </section>
          <section className="cc-section" aria-labelledby="cc-schedule-heading">
            <div className="cc-section-heading"><h3 id="cc-schedule-heading"><span>03</span>{t('clubs.readingSchedule')}</h3><small>{t('clubs.weekCount', { count: draft.schedule.length })}</small></div>
            <ClubScheduleEditor compact value={draft.schedule.map(step => ({ ...step, title: step.theme }))} onChange={stages => field('schedule', stages.map(stage => ({ ...stage, theme: stage.title })))} />
          </section>
        </div>
        <aside className="cc-preview" aria-label={t('clubs.circlePreview')} tabIndex={0}>
          <p className="eyebrow">{t('clubs.circlePreview')}</p>
          <div className="cc-preview-book">
            <div className="cc-cover"><BookCoverImage src={book?.coverUrl} alt="" /></div>
            <div><h4>{book?.title || t('clubs.bookPending')}</h4>{book?.author && <p>{book.author}</p>}</div>
          </div>
          {book && <div className="cc-book-source"><span>{source}</span>{book.isbn && <span>ISBN {book.isbn}</span>}</div>}
          <h3 className="cc-circle-name">{circleName}</h3>
          <dl className="cc-stats">
            <div><dt>{t('clubs.duration')}</dt><dd>{draft.duration.trim() || '—'}</dd></div>
            <div><dt>{t('clubs.schedule')}</dt><dd>{t('clubs.weekCount', { count: draft.schedule.length })}</dd></div>
            <div><dt>{t('clubs.readers')}</dt><dd>{draft.membersWanted || '—'}</dd></div>
          </dl>
          {draft.description.trim() && <p className="cc-preview-description">{draft.description.trim()}</p>}
          {tags.length > 0 && <div className="cc-tags">{tags.map((tag, index) => <span key={index}>{tag}</span>)}</div>}
          <div className="cc-preview-schedule">
            <h4>{t('clubs.readingJourney')}</h4>
            {draft.schedule.length ? <ol>{draft.schedule.map((week, index) => <li key={week.id || index}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{week.theme.trim() || t('clubs.themePending')}</strong>{week.chapters.trim() && <small>{week.chapters}</small>}</div></li>)}</ol> : <p>{t('clubs.schedulePending')}</p>}
          </div>
        </aside>
      </div>
      <footer className="cc-footer"><div><button type="button" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button className="primary-button" type="submit" disabled={busy}>{busy ? t('clubs.creating') : t('clubs.createAction')}</button></div></footer>
    </form>
  </ClubDialog>;
}
