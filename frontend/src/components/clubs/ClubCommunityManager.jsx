import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveClubAnnouncement, saveClubMemberTag, deleteClubCommunityItem } from '../../lib/bookClubApi';
export default function ClubCommunityManager({ club, user, community, onRefresh }) {
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState({ body: '', pinned: false });
  const [tag, setTag] = useState({ name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function act(task, done = () => {}) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); done(); await onRefresh(); setNotice(t('clubRoom.saved')); }
    catch { setError(t('clubRoom.saveFailed')); }
    finally { setBusy(false); }
  }
  function remove(table, id) {
    if (window.confirm(t('clubRoom.confirmRemove'))) void act(() => deleteClubCommunityItem(table, club.id, id));
  }
  return <section className="cr-community-editor">
    <h3>{t('clubRoom.announcements')}</h3>
    {community.announcements.map(item => <article key={item.id}><p>{item.body}</p><div className="cr-actions"><button type="button" disabled={busy} onClick={() => setAnnouncement(item)}>{t('clubRoom.edit')}</button><button type="button" disabled={busy} onClick={() => remove('club_announcements', item.id)}>{t('common.delete')}</button></div></article>)}
    <form onSubmit={e => { e.preventDefault(); void act(() => saveClubAnnouncement({ clubId: club.id, userId: user.id, ...announcement }), () => setAnnouncement({ body: '', pinned: false })); }}>
      <label>{t('clubRoom.noticeText')}<textarea required maxLength={2000} rows={3} value={announcement.body} onChange={e => setAnnouncement({ ...announcement, body: e.target.value })} /></label>
      <label className="cr-checkbox"><input type="checkbox" checked={announcement.pinned} onChange={e => setAnnouncement({ ...announcement, pinned: e.target.checked })} />{t('clubRoom.pin')}</label>
      <div className="cr-actions"><button disabled={busy || !announcement.body.trim()}>{t('clubRoom.saveAnnouncement')}</button>{announcement.id && <button type="button" onClick={() => setAnnouncement({ body: '', pinned: false })}>{t('clubRoom.cancel')}</button>}</div>
    </form>
    <h3>{t('clubRoom.availableTags')}</h3><p>{t('clubRoom.tagsHelp')}</p>
    {community.tags.map(item => <div className="cr-tag-editor" key={item.id}><span className="cr-pill">{item.name}</span><button type="button" disabled={busy} onClick={() => setTag(item)}>{t('clubRoom.edit')}</button><button type="button" disabled={busy} onClick={() => remove('club_member_tags', item.id)}>{t('common.delete')}</button></div>)}
    <form onSubmit={e => { e.preventDefault(); void act(() => saveClubMemberTag({ clubId: club.id, ...tag }), () => setTag({ name: '' })); }}>
      <label>{t('clubRoom.tagName')}<input required maxLength={30} value={tag.name} onChange={e => setTag({ ...tag, name: e.target.value })} /></label>
      <div className="cr-actions"><button disabled={busy || !tag.name.trim()}>{t('clubRoom.saveTag')}</button>{tag.id && <button type="button" onClick={() => setTag({ name: '' })}>{t('clubRoom.cancel')}</button>}</div>
    </form>
    {error && <p role="alert" className="cr-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
