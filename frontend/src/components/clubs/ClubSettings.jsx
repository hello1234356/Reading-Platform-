import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ClubDialog from './ClubDialog';
import ClubBookPicker from './ClubBookPicker';
import ClubScheduleEditor from './ClubScheduleEditor';
import ClubCommunityManager from './ClubCommunityManager';
import { updateBookClub, deleteBookClub } from '../../lib/bookClubApi';
import { parseClubTags, validateClubDetails } from '../../lib/clubValidation';

export default function ClubSettings({ club, user, schedule, community, onRefresh, onSaved, onClose, onDeleted }) {
  const { t } = useTranslation();
  const [baseline] = useState({ club, schedule });
  const [tab, setTab] = useState('general');
  const [draft, setDraft] = useState({ title: club.title, description: club.description, duration: club.duration, membersWanted: club.membersWanted, tagsText: club.tags.join(', '), schedule });
  const [book, setBook] = useState({ id: club.bookId, title: club.bookTitle, author: club.author, coverUrl: club.bookCoverUrl });
  const [confirmedBook, setConfirmedBook] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bookChanged = String(book.bookId || book.id || '') !== String(club.bookId);
  const dirty = draft.title !== club.title || draft.description !== club.description || draft.duration !== club.duration || Number(draft.membersWanted) !== club.membersWanted || draft.tagsText !== club.tags.join(', ') || bookChanged || JSON.stringify(draft.schedule) !== JSON.stringify(baseline.schedule);
  if (String(club.creatorId) !== String(user.id)) return null;
  function close() { if (!busy && (!dirty || window.confirm(t('clubRoom.discard')))) onClose(); }
  function field(name, value) { setDraft(current => ({ ...current, [name]: value })); }
  async function save(event) {
    event.preventDefault(); setError('');
    const tags = parseClubTags(draft.tagsText);
    const validation = validateClubDetails({ ...draft, tags }, club.memberCount);
    if (validation) { setError(t(`clubRoom.${validation}`)); return; }
    if (draft.schedule.some(stage => !stage.title.trim())) { setTab('book'); setError(t('clubRoom.scheduleInvalid')); return; }
    if (bookChanged && !confirmedBook) { setTab('book'); setError(t('clubRoom.bookWarning')); return; }
    setBusy(true);
    try {
      const next = await updateBookClub({ clubId: club.id, userId: user.id, selectedBook: book, ...draft, tags, updatedAt: baseline.club.updatedAt });
      await onSaved(next); onClose();
    } catch (failure) { setError(t(failure.message?.includes('changed') ? 'clubRoom.conflict' : 'clubRoom.saveFailed')); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (deleteName !== club.title || !window.confirm(t('clubRoom.confirmDelete', { name: club.title }))) return;
    setBusy(true); setError('');
    try { await deleteBookClub({ clubId: club.id, userId: user.id }); onDeleted(); }
    catch { setError(t('clubRoom.saveFailed')); setBusy(false); }
  }
  return <ClubDialog title={t('clubRoom.settings')} onClose={close} className="cr-settings">
    <nav className="cr-settings-tabs" aria-label={t('clubRoom.settings')}>{['general', 'book', 'capacity', 'community', 'danger'].map(key => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{t(`clubRoom.section_${key}`)}</button>)}</nav>
    <form id="club-settings-form" noValidate onSubmit={save}>
      <fieldset disabled={busy}>
        <section hidden={tab !== 'general'}><h3>{t('clubRoom.section_general')}</h3>
          <label>{t('clubs.bookClubName')}<input maxLength={100} value={draft.title} onChange={e => field('title', e.target.value)} /></label>
          <label>{t('clubs.description')}<textarea rows={4} maxLength={350} value={draft.description} onChange={e => field('description', e.target.value)} /></label>
          <label>{t('clubs.tags')}<input value={draft.tagsText} onChange={e => field('tagsText', e.target.value)} /></label><small>{t('clubRoom.clubTagsHelp')}</small>
        </section>
        <section hidden={tab !== 'book'}><h3>{t('clubRoom.section_book')}</h3>
          <ClubBookPicker value={book} onChange={value => { setBook(value); setConfirmedBook(false); }} />
          {bookChanged && <label className="cr-checkbox cr-warning"><input type="checkbox" checked={confirmedBook} onChange={e => setConfirmedBook(e.target.checked)} />{t('clubRoom.bookWarning')}</label>}
          <label>{t('clubs.howLong')}<input maxLength={100} value={draft.duration} onChange={e => field('duration', e.target.value)} /></label>
          <h3>{t('clubs.readingSchedule')}</h3><ClubScheduleEditor value={draft.schedule} onChange={value => field('schedule', value)} />
        </section>
        <section hidden={tab !== 'capacity'}><h3>{t('clubRoom.section_capacity')}</h3><p>{t('clubRoom.capacityHelp', { count: club.memberCount })}</p>
          <label>{t('clubs.membersWanted')}<input type="number" value={draft.membersWanted} onChange={e => field('membersWanted', e.target.value)} /></label>
        </section>
      </fieldset>
    </form>
    {tab === 'community' && <ClubCommunityManager club={club} user={user} community={community} onRefresh={onRefresh} />}
    {tab === 'danger' && <section className="cr-danger"><h3>{t('clubRoom.section_danger')}</h3><p>{t('clubRoom.ownerStay')}</p><label>{t('clubRoom.typeName', { name: club.title })}<input value={deleteName} onChange={e => setDeleteName(e.target.value)} /></label><button type="button" disabled={busy || deleteName !== club.title} onClick={remove}>{t('clubs.deleteClub')}</button></section>}
    {error && <p className="cr-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={close}>{t('clubRoom.cancel')}</button><button className="primary-button" type="submit" form="club-settings-form" disabled={busy}>{t(busy ? 'clubRoom.saving' : 'clubRoom.save')}</button></footer>
  </ClubDialog>;
}
