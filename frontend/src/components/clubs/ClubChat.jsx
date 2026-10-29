import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requireSupabase } from '../../lib/supabase';
import { createClubPost, deleteClubPost, getChannelPosts } from '../../lib/bookClubApi';
import { mergeClubMessages } from '../../lib/clubValidation';
import ClubMemberTags from './ClubMemberTags';
import { getClubMemberName, getClubMemberTags } from '../../lib/clubMemberProfile';
import UserAvatar from '../UserAvatar';
import ProfileLink from '../ProfileLink';
import ModerationWarningCard from '../ModerationWarningCard';

export default function ClubChat({ club, channel, user, community, onOpenProfile }) {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState(null);
  const [connected, setConnected] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [typing, setTyping] = useState({});
  const typingChannel = useRef(null);
  const lastTyping = useRef(0);
  const typingStop = useRef(null);
  const members = useRef(club.members);
  useLayoutEffect(() => { members.current = club.members; }, [club.members]);
  const list = useRef();
  const nearBottom = useRef(true);
  const newest = useRef(null);
  const prepend = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false, fetching = false, queued = false;
    async function refresh() {
      if (fetching) { queued = true; return; }
      fetching = true;
      try {
        // Catch up in bounded pages, including after a disconnected period.
        let cursor = newest.current;
        do {
          const page = await getChannelPosts({ clubId: club.id, channelId: channel.id, after: cursor });
          if (cancelled) return;
          if (!cursor) setHasOlder(page.length === 50);
          if (page.length) {
            setMessages(current => mergeClubMessages(current, page));
            newest.current = page.at(-1);
            if (!nearBottom.current) setUnseen(true);
          }
          if (!cursor || page.length < 50) break;
          cursor = page.at(-1);
        } while (!cancelled);
        setError('');
      } catch { if (!cancelled) setError(t('clubRoom.loadFailed')); }
      finally { fetching = false; if (!cancelled) { setLoading(false); if (queued) { queued = false; void refresh(); } } }
    }
    const client = requireSupabase();
    const subscription = client.channel(`club-chat-${club.id}-${channel.id}`, { config: { presence: { key: user.id } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (cancelled || !payload?.userId || payload.userId === user.id || !members.current.some(member => member.userId === payload.userId)) return;
        setTyping(current => {
          const next = { ...current };
          if (payload.active) next[payload.userId] = Date.now(); else delete next[payload.userId];
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!cancelled) setTyping(current => { const next = { ...current }; delete next[key]; return next; });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_posts', filter: `channel_id=eq.${channel.id}` }, refresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'club_posts' }, payload => {
        if (!cancelled) setMessages(current => current.filter(row => String(row.id) !== String(payload.old.id)));
      })
      .subscribe(status => { if (!cancelled) { setConnected(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') { void subscription.track({ userId: user.id }); void refresh(); } } });
    typingChannel.current = subscription;
    const typingTimer = setInterval(() => setTyping(current => Object.fromEntries(Object.entries(current).filter(([, at]) => Date.now() - at < 3500))), 1000);
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { cancelled = true; mounted.current = false; clearInterval(timer); clearInterval(typingTimer); clearTimeout(typingStop.current); void subscription.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id, active: false } }).catch(() => {}); typingChannel.current = null; void client.removeChannel(subscription); };
  }, [club.id, channel.id, user.id, t]);
  useLayoutEffect(() => {
    if (!list.current) return;
    if (prepend.current) { list.current.scrollTop += list.current.scrollHeight - prepend.current.height; prepend.current = null; }
    else if (nearBottom.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);
  useLayoutEffect(() => {
    const element = list.current;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  async function loadOlder() {
    setOlder(true);
    try {
      const page = await getChannelPosts({ clubId: club.id, channelId: channel.id, before: messages[0] });
      if (!mounted.current) return;
      prepend.current = { height: list.current.scrollHeight };
      setMessages(current => mergeClubMessages(page, current)); setHasOlder(page.length === 50);
    } catch { setError(t('clubRoom.loadFailed')); }
    finally { setOlder(false); }
  }
  function broadcastTyping(active) {
    void typingChannel.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id, active } }).catch(() => {});
  }
  function stopTyping() {
    clearTimeout(typingStop.current); lastTyping.current = 0; broadcastTyping(false);
  }
  function draftChange(text) {
    setDraft(text); setWarning(null); clearTimeout(typingStop.current);
    if (!text.trim()) { stopTyping(); return; }
    if (!lastTyping.current || Date.now() - lastTyping.current > 1500) {
      lastTyping.current = Date.now(); broadcastTyping(true);
    }
    typingStop.current = setTimeout(stopTyping, 1800);
  }
  const typingNames = club.members.filter(member => typing[member.userId]).map(member => getClubMemberName(member)).slice(0, 3).join(', ');
  async function send(allowWarning = false) {
    if (sending || !draft.trim()) return;
    stopTyping();
    setSending(true); setError(''); setWarning(null);
    try {
      const message = await createClubPost({ clubId: club.id, userId: user.id, channelId: channel.id, message: draft.trim(), allowModerationWarning: allowWarning });
      if (!mounted.current) return;
      nearBottom.current = true; setUnseen(false); setDraft('');
      setMessages(current => mergeClubMessages(current, [message]));
    } catch (failure) {
      if (failure.code === 'MODERATION_WARNING') setWarning(failure.message);
      else setError(failure.code?.startsWith('MODERATION') ? t('clubRoom.moderationFailed') : t('clubRoom.sendFailed'));
    } finally { if (mounted.current) setSending(false); }
  }
  async function remove(message) {
    if (!window.confirm(t('clubRoom.confirmMessageDelete'))) return;
    try { await deleteClubPost({ postId: message.id, userId: user.id }); setMessages(current => current.filter(row => row.id !== message.id)); }
    catch { setError(t('clubRoom.saveFailed')); }
  }
  return <section className="cr-chat" aria-label={t('clubRoom.chat')}>
    <header className="cr-channel-heading"><div><h2><span>#</span> {channel.slug}</h2>{channel.slug === 'spoiler-zone' && <p>{t('clubRoom.spoilerDescription')}</p>}</div><span className={`cr-connection ${connected ? 'online' : ''}`} role="status">{t(connected ? 'clubRoom.live' : 'clubRoom.reconnecting')}</span></header>
    <div className="cr-messages" ref={list} aria-busy={loading} onScroll={() => { const el = list.current; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; if (nearBottom.current) setUnseen(false); }}>
      <div className={`cr-message-stack${!messages.length ? ' is-empty' : ''}`}>
      {hasOlder && <button className="cr-load-older" disabled={older} onClick={loadOlder}>{t(older ? 'clubRoom.loading' : 'clubRoom.older')}</button>}
      {loading ? <p className="cr-empty">{t('clubRoom.loading')}</p> : !messages.length && <p className="cr-empty">{t('clubRoom.emptyChat')}</p>}
      {messages.map((message, index) => {
        const member = club.members.find(item => item.userId === message.userId);
        const name = getClubMemberName(member, message.authorName);
        const previous = messages[index - 1];
        const sameGroup = previous && previous.userId === message.userId && new Date(message.createdAt) - new Date(previous.createdAt) <= 5 * 60 * 1000;
        return <article className={`cr-message${previous && !sameGroup ? ' cr-message-group-start' : ''}${sameGroup ? ' cr-message-continuation' : ''}`} key={message.id}>
          {member ? <button type="button" className="cr-avatar-link" aria-label={t('clubRoom.openMemberProfile', { name })} onClick={() => onOpenProfile(member.userId)}><UserAvatar avatarUrl={member.avatarUrl} name={name} size="small" /></button> : <UserAvatar avatarUrl={message.authorAvatarUrl} name={name} size="small" />}
          <div>
            <header className="cr-message-header">
              <div className="cr-message-identity">
                {member ? <button type="button" className="cr-member-name" title={`@${member.username || member.accountName}`} onClick={() => onOpenProfile(member.userId)}>{name}</button> : <ProfileLink userId={message.userId}>{name}</ProfileLink>}
                <ClubMemberTags tags={getClubMemberTags(community, message.userId)} />
              </div>
              <div className="cr-message-meta">
                {message.userId === club.creatorId && <><span className="cr-host">{t('clubs.host')}</span><span aria-hidden="true">·</span></>}
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                {message.userId === user.id && <button onClick={() => remove(message)} aria-label={t('clubRoom.deleteMessage')}>×</button>}
              </div>
            </header>
            <p>{message.message}</p>
          </div>
        </article>;
      })}
      </div>
    </div>
    {unseen && <button className="cr-jump" onClick={() => { nearBottom.current = true; list.current.scrollTop = list.current.scrollHeight; setUnseen(false); }}>{t('clubRoom.latest')} ↓</button>}
    <div className="cr-typing-slot" role="status" aria-live="polite">{typingNames && <div className="club-typing-indicator"><span className="club-typing-dots" aria-hidden="true"><i /><i /><i /></span><span>{t('clubRoom.typing', { names: typingNames })}</span></div>}</div>
    <div className="cr-composer"><div aria-live="polite">{error && <p className="cr-error" role="alert">{error}</p>}{warning && <ModerationWarningCard message={warning} onEdit={() => setWarning(null)} onConfirm={() => send(true)} confirming={sending} contentLabel={t('clubRoom.message')} />}</div>
      <form onSubmit={e => { e.preventDefault(); void send(); }}><textarea aria-label={t('clubRoom.message')} placeholder={t('clubRoom.messagePlaceholder', { channel: channel.slug })} rows={2} maxLength={2000} value={draft} disabled={sending} onBlur={stopTyping} onChange={e => draftChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><button className="primary-button" disabled={sending || !draft.trim()}>{t(sending ? 'clubRoom.sending' : 'home.send')}</button></form><small>{t('clubRoom.composerHelp')} · {draft.length}/2000</small>
    </div>
  </section>;
}
