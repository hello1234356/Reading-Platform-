import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ClubDialog from './ClubDialog';
import ClubMemberTags from './ClubMemberTags';
import UserAvatar from '../UserAvatar';
import ModerationWarningCard from '../ModerationWarningCard';
import { saveClubMemberProfile } from '../../lib/bookClubApi';
import { getClubMemberName, getClubMemberTags, getClubTagClass, validateClubNickname, CLUB_NICKNAME_MAX_LENGTH } from '../../lib/clubMemberProfile';

export default function ClubMemberProfile({ club, member, user, community, onSaved, onClose }) {
  const { t } = useTranslation();
  const own = member.userId === user.id;
  const [editing, setEditing] = useState(null);
  const [nickname, setNickname] = useState(member.nickname || '');
  const [tagIds, setTagIds] = useState(() => community.assignments.filter(row => row.user_id === member.userId).map(row => row.tag_id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const selected = getClubMemberTags(community, member.userId);
  const activeTagIds = tagIds.filter(id => community.tags.some(tag => String(tag.id) === String(id)));
  const savedNickname = editing === 'tags' ? member.nickname || '' : nickname;
  async function save(allowWarning = false) {
    const validation = validateClubNickname(savedNickname);
    if (validation) { setError(t(`clubRoom.${validation}`)); return; }
    setBusy(true); setError(''); setWarning('');
    try {
      await saveClubMemberProfile({ clubId: club.id, nickname: savedNickname, tagIds: activeTagIds, allowModerationWarning: allowWarning });
      await onSaved(); setEditing(null);
    } catch (failure) {
      if (failure.code === 'MODERATION_WARNING') setWarning(failure.message);
      else setError(t(failure.code?.startsWith('MODERATION') ? 'clubRoom.moderationFailed' : 'clubRoom.saveFailed'));
    } finally { setBusy(false); }
  }
  function edit(mode) {
    setNickname(member.nickname || ''); setTagIds(selected.map(tag => tag.id));
    setError(''); setWarning(''); setEditing(mode);
  }
  function toggle(id) { setTagIds(activeTagIds.includes(id) ? activeTagIds.filter(item => item !== id) : activeTagIds.length < 3 ? [...activeTagIds, id] : activeTagIds); setWarning(''); }
  return <ClubDialog title={t('clubRoom.memberProfile')} onClose={() => { if (!busy) onClose(); }} className="cr-member-profile">
    <div className="cr-profile-heading"><UserAvatar avatarUrl={member.avatarUrl} name={getClubMemberName(member)} /><div><h3>{getClubMemberName(member)}</h3><p className="cr-account-identity">@{member.username || member.accountName}</p><small>{t(member.userId === club.creatorId ? 'clubs.host' : 'clubRoom.memberRole')}</small></div></div>
    {editing && own ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy}>
        {editing === 'profile' && <><label>{t('clubRoom.clubNickname')}<input value={nickname} maxLength={CLUB_NICKNAME_MAX_LENGTH} placeholder={member.username || member.accountName} onChange={event => { setNickname(event.target.value); setWarning(''); }} /></label><small>{t('clubRoom.nicknameHelp')}</small></>}
        <div className="cr-member-tags-heading"><h3>{t('clubRoom.memberTags')}</h3><span className="cr-muted">{t('clubRoom.tagSelectionCount', { count: activeTagIds.length })}</span></div>
        {community.tags.length ? <><p className="cr-muted">{t('clubRoom.selectTags')}</p><div className="cr-tag-options" role="group" aria-label={t('clubRoom.memberTags')}>{community.tags.map(tag => <button type="button" className={getClubTagClass(tag)} key={tag.id} aria-pressed={activeTagIds.includes(tag.id)} disabled={!activeTagIds.includes(tag.id) && activeTagIds.length >= 3} onClick={() => toggle(tag.id)}>{activeTagIds.includes(tag.id) && <span aria-hidden="true">✓ </span>}{tag.name}</button>)}</div></> : <p>{t('clubRoom.noTags')}</p>}
      </fieldset>
      {error && <p className="cr-error" role="alert">{error}</p>}{warning && <ModerationWarningCard message={warning} contentLabel={t('clubRoom.clubNickname')} onEdit={() => setWarning('')} onConfirm={() => save(true)} confirming={busy} />}
      <footer><button type="button" disabled={busy} onClick={() => { setEditing(null); setError(''); setWarning(''); }}>{t('clubRoom.cancel')}</button><button className="primary-button" disabled={busy}>{t(busy ? 'clubRoom.saving' : 'clubRoom.save')}</button></footer>
    </form> : <>
      <div className="cr-member-tags-heading"><h3>{t('clubRoom.memberTags')}</h3>{own && community.tags.length > 0 && <button type="button" className="cr-edit-tags" onClick={() => edit('tags')}>{t(selected.length ? 'clubRoom.editTags' : 'clubRoom.addTags')}</button>}</div>
      {selected.length > 0 ? <div className="cr-profile-tags"><ClubMemberTags tags={selected} /></div> : <p className="cr-muted">{t('clubRoom.noSelectedTags')}</p>}
      {own && <footer><button type="button" onClick={() => edit('profile')}>{t('clubRoom.editProfile')}</button></footer>}
    </>}
  </ClubDialog>;
}
