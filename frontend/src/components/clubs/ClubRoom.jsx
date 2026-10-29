import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requireSupabase } from '../../lib/supabase';
import { getBookClubById, getClubChannels, getClubCommunity, getClubSchedule, leaveBookClub, recordClubActivity } from '../../lib/bookClubApi';
import BookCoverImage from '../BookCoverImage';
import UserAvatar from '../UserAvatar';
import ClubSettings from './ClubSettings';
import ClubNotice from './ClubNotice';
import ClubDialog from './ClubDialog';
import ClubChat from './ClubChat';
import ClubMemberProfile from './ClubMemberProfile';
import { getClubMemberName } from '../../lib/clubMemberProfile';
import './ClubRoom.css';
function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional preference */ } }
export default function ClubRoom({ initialClub, user, onClubUpdated }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [club, setClub] = useState(initialClub);
  const [schedule, setSchedule] = useState([]);
  const [channels, setChannels] = useState([]);
  const [community, setCommunity] = useState({ announcements: [], tags: [], assignments: [] });
  const [selected, setSelected] = useState(() => stored(`club-channel-${user.id}-${initialClub.id}`, 'general'));
  const [left, setLeft] = useState(() => stored('club-left-open', true));
  const [right, setRight] = useState(() => stored('club-right-open', true));
  const [drawer, setDrawer] = useState(null);
  const [settings, setSettings] = useState(false);
  const [spoiler, setSpoiler] = useState(false);
  const [acknowledged, setAcknowledged] = useState(() => stored(`club-spoilers-${user.id}-${initialClub.id}`, false));
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1050px)').matches);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState(null);
  const owner = club.creatorId === user.id;
  const spoilerKey = `club-spoilers-${user.id}-${club.id}`;
  const linkedChannelId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('channel');
  const linkedSpoiler = !acknowledged && channels.some(item => String(item.id) === linkedChannelId && item.slug === 'spoiler-zone');
  const channel = channels.find(item => (linkedChannelId ? String(item.id) === linkedChannelId : item.slug === selected) && (item.slug !== 'spoiler-zone' || acknowledged)) || channels.find(item => item.slug === 'general');

  async function refreshCommunity() { setCommunity(await getClubCommunity(club.id)); }
  async function refreshProfile() {
    const [next, social] = await Promise.all([getBookClubById({ clubId: club.id, currentUserId: user.id }), getClubCommunity(club.id)]);
    if (next) { setClub(next); onClubUpdated(next); }
    setCommunity(social);
  }
  function openProfile(id) { setDrawer(null); setProfileId(id); }
  const profileMember = club.members.find(member => member.userId === profileId);
  useEffect(() => {
    let cancelled = false, fetching = false, queued = false;
    async function refresh() {
      if (fetching) { queued = true; return; } fetching = true;
      try {
        const next = await getBookClubById({ clubId: initialClub.id, currentUserId: user.id });
        if (cancelled) return;
        if (!next || !next.isJoined) { navigate('/clubs', { replace: true }); return; }
        const [stages, rooms, social] = await Promise.all([getClubSchedule(next.id), getClubChannels(next.id), getClubCommunity(next.id)]);
        if (!cancelled) { setClub(next); setSchedule(stages); setChannels(rooms); setCommunity(social); setError(''); }
      } catch { if (!cancelled) setError(t('clubRoom.loadFailed')); }
      finally { fetching = false; if (!cancelled) { setLoading(false); if (queued) { queued = false; void refresh(); } } }
    }
    void refresh();
    void recordClubActivity({ clubId: initialClub.id, userId: user.id, eventType: 'visited_room' }).catch(() => {});
    const client = requireSupabase();
    let subscription = client.channel(`club-community-${initialClub.id}`);
    for (const table of ['book_clubs', 'club_schedule', 'club_members', 'club_announcements', 'club_member_tags']) {
      subscription = subscription.on('postgres_changes', { event: '*', schema: 'public', table, filter: `${table === 'book_clubs' ? 'id' : 'club_id'}=eq.${initialClub.id}` }, refresh);
    }
    // DELETE events use the assignment's composite primary key and cannot
    // reliably use Postgres Changes row filters. Handle both additions and
    // removals by club ID, including when the last selected tag is removed.
    subscription.on('postgres_changes', { event: '*', schema: 'public', table: 'club_member_tag_assignments' }, payload => {
      const changedClubId = payload.new?.club_id ?? payload.old?.club_id;
      if (String(changedClubId) === String(initialClub.id)) void refresh();
    });
    subscription.subscribe();
    const timer = setInterval(refresh, 15000);
    return () => { cancelled = true; clearInterval(timer); void client.removeChannel(subscription); };
  }, [initialClub.id, user.id, navigate, t]);
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    const viewport = window.visualViewport;
    const media = window.matchMedia('(max-width: 1050px)');
    const previousHeight = root.style.getPropertyValue('--club-viewport-height');
    const previousTop = root.style.getPropertyValue('--club-viewport-top');
    function resize() {
      // CSS sizes the navigation and dock. Only the visual viewport needs JS:
      // mobile keyboards can resize/pan it without changing the layout viewport.
      // Leave pinch zoom to the browser instead of resizing the app while zooming.
      if (viewport && viewport.scale === 1) {
        root.style.setProperty('--club-viewport-height', `${viewport.height}px`);
        root.style.setProperty('--club-viewport-top', `${viewport.offsetTop}px`);
      }
    }
    function breakpointChanged(event) { setCompact(event.matches); }
    resize();
    media.addEventListener('change', breakpointChanged);
    window.addEventListener('resize', resize);
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      media.removeEventListener('change', breakpointChanged);
      window.removeEventListener('resize', resize);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      if (previousHeight) root.style.setProperty('--club-viewport-height', previousHeight);
      else root.style.removeProperty('--club-viewport-height');
      if (previousTop) root.style.setProperty('--club-viewport-top', previousTop);
      else root.style.removeProperty('--club-viewport-top');
    };
  }, []);
  function toggle(side) {
    if (window.matchMedia('(max-width: 1050px)').matches) { setDrawer(side); return; }
    if (side === 'left') { persist('club-left-open', !left); setLeft(!left); } else { persist('club-right-open', !right); setRight(!right); }
  }
  function selectChannel(item) {
    if (linkedChannelId) navigate(`/clubs/${club.id}`, { replace: true });
    if (item.slug === 'spoiler-zone' && !acknowledged) { setSpoiler(true); return; }
    setSelected(item.slug); persist(`club-channel-${user.id}-${club.id}`, item.slug); setDrawer(null);
  }
  async function leave() {
    if (owner || !window.confirm(t('clubRoom.confirmLeave'))) return;
    setBusy(true);
    try { await leaveBookClub({ clubId: club.id, userId: user.id }); navigate('/clubs'); }
    catch { setError(t('clubRoom.saveFailed')); }
    finally { setBusy(false); }
  }
  const leftPanel = <>
    <div className="cr-book"><BookCoverImage src={club.coverUrl} alt="" /><div><strong>{club.bookTitle}</strong><small>{club.author}</small><small>{club.duration}</small></div></div>
    <h3>{t('clubRoom.channels')}</h3><nav className="cr-channels" aria-label={t('clubRoom.channels')}>{channels.map(item => <button key={item.id} aria-current={channel?.id === item.id ? 'page' : undefined} onClick={() => selectChannel(item)}><span>#</span> {item.slug}{item.slug === 'spoiler-zone' && <span aria-hidden="true"> ◇</span>}</button>)}</nav>
    <div className="cr-section-heading"><h3>{t('clubs.readingSchedule')}</h3>{owner && <button disabled={loading} onClick={() => { setDrawer(null); setSettings(true); }} aria-label={t('clubs.editSchedule')}>✎</button>}</div>
    {!schedule.length && <p className="cr-muted">{t('clubRoom.noSchedule')}</p>}
    {schedule.map((stage, index) => <details className="cr-stage" key={stage.id}><summary><small>{t('clubs.week', { week: index + 1 })}</small><strong>{stage.title}</strong></summary><p>{stage.chapters}</p><p>{stage.description}</p></details>)}
  </>;
  const rightPanel = <>
    <div className="cr-section-heading"><h3>{t('clubRoom.announcements')}</h3>{owner && <button disabled={loading} aria-label={t('clubRoom.manageCommunity')} onClick={() => { setDrawer(null); setSettings(true); }}>✎</button>}</div>
    {!community.announcements.length && <p className="cr-muted">{t('clubRoom.noAnnouncements')}</p>}
    {community.announcements.map(item => <ClubNotice key={item.id} notice={item} authorName={club.members.find(member => member.userId === item.author_id)?.name || club.creatorName} />)}
    <h3>{t('clubs.members')} <span>{club.memberCount}/{club.membersWanted}</span></h3>
    <div className="cr-members">{club.members.map(member => <button type="button" className="cr-member-row" key={member.userId} onClick={() => openProfile(member.userId)}><UserAvatar avatarUrl={member.avatarUrl} name={getClubMemberName(member)} size="small" /><span><strong>{getClubMemberName(member)}</strong>{member.userId === club.creatorId && <span className="cr-host">{t('clubs.host')}</span>}</span></button>)}</div>
    <details className="cr-about"><summary>{t('clubRoom.about')}</summary><p>{club.description}</p><div className="cr-tags">{club.tags.map(tag => <span className="cr-pill" key={tag}>{tag}</span>)}</div></details>
  </>;
  return <section className={`cr-room ${left ? '' : 'cr-left-closed'} ${right ? '' : 'cr-right-closed'}`}>
    <header className="cr-header"><Link to="/clubs" aria-label={t('clubs.backAll')}>←</Link><div className="cr-title"><h1>{club.title}</h1><p>{t('clubs.host')}: {club.creatorName} <span>· {club.memberCount}/{club.membersWanted} · {t('clubs.youJoined')}</span></p></div><div className="cr-actions"><button aria-label={t('clubRoom.toggleReading')} aria-expanded={compact ? drawer === 'left' : left} onClick={() => toggle('left')}>☷</button><button aria-label={t('clubRoom.toggleCommunity')} aria-expanded={compact ? drawer === 'right' : right} onClick={() => toggle('right')}>♧</button>{owner ? <button disabled={loading || !!error} aria-label={t('clubRoom.settings')} title={t('clubRoom.settings')} onClick={() => setSettings(true)}>⚙</button> : <details className="cr-overflow"><summary aria-label={t('clubRoom.actions')}>•••</summary><button disabled={busy} onClick={leave}>{t('clubs.quit')}</button></details>}</div></header>
    {error && <p className="cr-error" role="alert">{error}</p>}{notice && <p className="cr-notice" role="status">{notice}<button aria-label={t('clubRoom.close')} onClick={() => setNotice('')}>×</button></p>}
    <div className="cr-layout"><aside className="cr-sidebar cr-left" aria-label={t('clubRoom.readingPanel')}>{leftPanel}</aside>{channel ? <ClubChat key={channel.id} club={club} channel={channel} user={user} community={community} onOpenProfile={openProfile} /> : <p className="cr-empty">{t(loading ? 'clubRoom.loading' : 'clubRoom.loadFailed')}</p>}<aside className="cr-sidebar cr-right" aria-label={t('clubRoom.communityPanel')}>{rightPanel}</aside></div>
    {drawer && <ClubDialog title={t(drawer === 'left' ? 'clubRoom.readingPanel' : 'clubRoom.communityPanel')} onClose={() => setDrawer(null)} className={`cr-drawer cr-drawer-${drawer}`}><div className="cr-sidebar">{drawer === 'left' ? leftPanel : rightPanel}</div></ClubDialog>}
    {(spoiler || linkedSpoiler) && <ClubDialog title={t('clubRoom.spoilerTitle')} onClose={() => { setSpoiler(false); if (linkedSpoiler) navigate(`/clubs/${club.id}`, { replace: true }); }}><p>{t('clubRoom.spoilerWarning')}</p><footer><button onClick={() => { setSpoiler(false); if (linkedSpoiler) navigate(`/clubs/${club.id}`, { replace: true }); }}>{t('clubRoom.cancel')}</button><button className="primary-button" onClick={() => { persist(spoilerKey, true); setAcknowledged(true); setSpoiler(false); setSelected('spoiler-zone'); persist(`club-channel-${user.id}-${club.id}`, 'spoiler-zone'); setDrawer(null); }}>{t('clubRoom.enterSpoilers')}</button></footer></ClubDialog>}
    {profileMember && <ClubMemberProfile key={profileMember.userId} club={club} member={profileMember} user={user} community={community} onSaved={refreshProfile} onClose={() => setProfileId(null)} />}
    {settings && owner && <ClubSettings club={club} user={user} schedule={schedule} community={community} onRefresh={refreshCommunity} onClose={() => setSettings(false)} onDeleted={() => navigate('/clubs')} onSaved={async next => { setClub(next); onClubUpdated(next); setSchedule(await getClubSchedule(club.id)); setNotice(t('clubRoom.saved')); }} />}
  </section>;
}
