import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useEventsAccess } from '../context/eventsAccess';
import { actOnCreativeEvent, findCreativeUsers, listCreativeEvents, readCreativeEvent } from '../lib/creativeEventsApi';
import { availableVotes, isSingleSentence, relayProgress, shanghaiDateInput, shanghaiMidnight } from '../lib/creativeEventsModel';
import relayArt from '../assets/creative/story-relay.webp';
import marketArt from '../assets/creative/theme-marketplace.webp';
import CreativeRosterManager from '../components/CreativeRosterManager';
import { CreativeStoryAdmin, CreativePitchAdmin } from '../components/CreativeEventAdminViews';
import './CreativeEvents.css';
import './StoryRelay.css';
import './ThemeMarketplace.css';

const titles = { 'story-relay': 'The Story Relay', 'theme-marketplace': 'The Theme Marketplace' };
const phaseLabels = { paused: 'Paused', draft: 'Sealed for now', scheduled: 'Pass it on', free: 'Anything goes', closed: 'Until the party…', revealed: 'The whole story', collecting: 'Open for ideas', voting: 'The marketplace is open', results: 'The people have spoken' };

export function CreativeEventLinks() {
  const { user } = useAuth();
  const { isAdmin } = useEventsAccess();
  const [state, setState] = useState(null);
  useEffect(() => {
    let live = true;
    if (user) listCreativeEvents().then(events => { if (live) setState({ id: user.id, events }); })
      .catch(() => { if (live) setState({ id: user.id, events: [], error: true }); });
    return () => { live = false; };
  }, [user]);
  if (!user || state?.id !== user.id) return null;
  if (state.error && isAdmin) return <p role="status">Creative rooms need the creative-events database migration.</p>;
  if (!state.events.length) return null;
  return <section className="up-invitations" aria-label="Your Tsinglan UP invitations">
    <p className="up-kicker">TSINGLAN UP / WRITING DEPARTMENT</p>
    <div>{state.events.map(event => <Link to={`/events/${event.slug}`} key={event.slug}>
      <img src={event.kind === 'relay' ? relayArt : marketArt} alt="" loading="lazy" />
      <span><small>INVITATION ONLY / {phaseLabels[event.phase]}</small><strong>{titles[event.slug]}</strong><span>Step inside <span aria-hidden="true">↗</span></span></span>
    </Link>)}</div>
  </section>;
}

export default function CreativeEvents() {
  const { user, loading } = useAuth();
  const { eventSlug } = useParams();
  useEffect(() => { window.scrollTo(0, 0); }, [eventSlug]);
  if (loading) return <p className="up-loading" role="status">Opening the room…</p>;
  if (!user) return <section className="up-loading"><p>This room is invitation only.</p><Link to="/login" state={{ from: `/events/${eventSlug}` }}>Sign in →</Link></section>;
  return <ConnectedRoom key={`${user.id}:${eventSlug}`} slug={eventSlug} />;
}

function ConnectedRoom({ slug }) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const version = useRef({ request: 0, disposed: false });
  const refresh = useCallback(async () => {
    const tracker = version.current;
    const request = ++tracker.request;
    try {
      const result = await readCreativeEvent(slug);
      if (!tracker.disposed && request === tracker.request) { setRoom(result); setError(''); }
    } catch (err) {
      if (!tracker.disposed && request === tracker.request) {
        // Fail closed, including when an invitation was revoked in another tab.
        setRoom(null);
        setError(err.code === '42501' ? 'This room is invitation only.' : 'The room could not be loaded. Please try again.');
      }
    }
  }, [slug]);
  useEffect(() => {
    const tracker = version.current;
    tracker.disposed = false;
    void Promise.resolve().then(refresh);
    const timer = window.setInterval(refresh, 12000);
    window.addEventListener('focus', refresh);
    return () => { tracker.disposed = true; tracker.request++; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  async function act(action, payload, success = '') {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setNotice('');
    try {
      await actOnCreativeEvent(slug, action, payload);
      await refresh(); setNotice(success); return true;
    } catch (err) {
      await refresh(); setNotice(err.message || 'Please try again.'); return false;
    } finally { pending.current = false; setBusy(false); }
  }
  if (!room) return <section className="up-loading"><p role={error ? 'alert' : 'status'}>{error || 'Opening the room…'}</p>{error && <button onClick={refresh}>Try again</button>}<Link to="/events">← Events</Link></section>;
  return <CreativeEventRoom room={room} act={act} busy={busy} notice={notice} />;
}

export function CreativeEventRoom({ room, act, busy = false, notice = '' }) {
  const [projecting, setProjecting] = useState(false);
  const marketDialog = useRef(null);
  const marketWorkspace = room.kind === 'market' && room.phase === 'collecting';
  const relayWorkspace = room.kind === 'relay' && room.phase !== 'revealed' && !projecting;
  return <section className={`up-room up-${room.kind}${relayWorkspace ? ' up-relay-workspace' : ''}${marketWorkspace ? ' up-market-workspace' : ''}${projecting ? ' up-projecting' : ''}`}>
    {room.kind !== 'relay' && <div className="up-room-nav"><Link to="/events">← Events</Link><span>TSINGLAN UP <i>Writing Department</i></span><span className="up-market-actions">{room.organizer ? <button className="relay-manage" aria-label="Organizer controls" onClick={() => marketDialog.current.showModal()}>⚙</button> : 'INVITATION ONLY'}</span></div>}
    {room.kind === 'relay' ? <Relay room={room} act={act} busy={busy} notice={notice} projecting={projecting} setProjecting={setProjecting} /> : <>
      <Marketplace room={room} act={act} busy={busy} notice={notice} />
      {room.organizer && <dialog ref={marketDialog} className="up-organizer-dialog" aria-labelledby="market-organizer-title" onClick={e => { if (e.target === e.currentTarget) marketDialog.current.close(); }}>
        <div className="up-organizer-heading"><h2 id="market-organizer-title">Organizer’s desk</h2><button aria-label="Close organizer controls" onClick={() => marketDialog.current.close()}>×</button></div>
        {notice && <p role="status">{notice}</p>}
        <Organizer room={room} act={act} busy={busy} expanded />
      </dialog>}
    </>}
  </section>;
}

function Relay({ room, act, busy, notice, projecting, setProjecting }) {
  const { current, completed, total } = relayProgress(room.queue);
  const [sentence, setSentence] = useState('');
  const [validation, setValidation] = useState('');
  const organizerDialog = useRef(null);
  const queueDialog = useRef(null);
  const roster = room.rosterSlots?.length ? room.rosterSlots : [...new Map(room.queue.map(turn => [turn.userId, { id: turn.userId, name: turn.name }])).values()];
  // Before the queue is established, organizers can still see their invitees.
  if (!roster.length) roster.push(...(room.participants || []));
  const scheduledTotal = room.phase === 'draft' ? (room.scheduledTotal ?? roster.length * (room.turnsPerWriter || 2)) : total;
  async function submit(event) {
    event.preventDefault();
    if (!room.canWrite) return;
    if (!isSingleSentence(sentence)) { setValidation('Write one sentence, ending with punctuation.'); return; }
    if (await act('submit', { sentence, token: room.writeToken }, 'Passed on.')) { setSentence(''); setValidation(''); }
  }
  if (room.phase === 'revealed' || projecting) return <StoryReveal room={room} projecting={projecting} setProjecting={setProjecting} />;
  const waiting = room.phase === 'draft' ? 'The relay hasn’t started.' : room.phase === 'closed' ? 'Submissions are closed.' : 'Sealed until your turn.';
  return <>
    <header className="relay-workspace-header">
      <h1>Story <em>Relay</em></h1><span className="relay-count" aria-label={`${completed} of ${scheduledTotal} scheduled sentences`}>{completed} / {scheduledTotal}</span>
      {room.organizer && <button className="relay-manage" aria-label="Organizer controls" onClick={() => organizerDialog.current.showModal()}>⚙</button>}
    </header>
    <div className="relay-workspace-body">
      <section className="relay-writer" aria-label="Your writing turn">
        <div className="relay-previous"><h2>Previous sentence</h2><blockquote>{room.canWrite ? room.previous : waiting}</blockquote></div>
        <form className="relay-compose" onSubmit={submit}>
          <label htmlFor="relay-sentence">Your sentence</label>
          <textarea id="relay-sentence" value={sentence} onChange={e => { setSentence(e.target.value); setValidation(''); }} required maxLength={1000} placeholder={room.canWrite ? 'And then…' : 'Waiting for your turn…'} disabled={busy || !room.canWrite} />
          <div className="relay-compose-footer">
            <div className="relay-feedback">
              {validation ? <p role="alert">{validation}</p> : notice ? <p role="status">{notice}</p> : room.canWrite && room.claimUntil ? <p role="status">Until {new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(room.claimUntil))} Shanghai time</p> : null}
            </div>
            {room.canClaim ? <button type="button" className="up-action" disabled={busy} onClick={() => act('claim')}>Take the pen ↗</button> : <button className="up-action" disabled={busy || !room.canWrite}>Pass it on ↗</button>}
          </div>
        </form>
      </section>
      <aside className="relay-roster" aria-labelledby="relay-roster-title">
        <div className="relay-roster-heading"><h2 id="relay-roster-title">Roster</h2><button aria-label="Full writing queue" onClick={()=>queueDialog.current.showModal()}>↗</button></div>
        {roster.length ? <ol style={{ '--roster-size': roster.length }}>{roster.map(writer => {
          const turns = room.queue.filter(turn => writer.slotId ? turn.slotId === writer.slotId : turn.userId === writer.id);
          const writing = Boolean(writer.id && current?.userId === writer.id && room.phase === 'scheduled');
          return <li key={writer.slotId || writer.id || writer.name} className={writing ? 'is-writing' : undefined}>
            <span>{writer.name}</span><small>{!writer.id ? 'Account pending' : writing ? 'Now' : turns.length && turns.every(turn => turn.done) ? <span aria-label="All scheduled turns complete">✓✓</span> : turns.some(turn => turn.done) ? <span aria-label="One turn complete">✓</span> : ''}</small>
          </li>;
        })}</ol> : <p className="relay-roster-empty" role="status">Writers will appear here.</p>}
      </aside>
    </div>
    <dialog ref={queueDialog} className="up-organizer-dialog relay-queue-dialog" aria-labelledby="relay-queue-title" onClick={e=>{if(e.target===e.currentTarget)queueDialog.current.close();}}>
      <div className="up-organizer-heading"><h2 id="relay-queue-title">Writing order</h2><button aria-label="Close writing queue" onClick={()=>queueDialog.current.close()}>×</button></div>
      <ol>{room.queue.map(turn=><li key={turn.id}><span>{turn.done ? '✓ ' : ''}{turn.name}{turn.pendingAccount ? ' · Account pending' : ''}</span><small>Round {turn.round}</small></li>)}</ol>
    </dialog>
    {room.organizer && <dialog ref={organizerDialog} className="up-organizer-dialog" aria-labelledby="relay-organizer-title" onClick={e => { if (e.target === e.currentTarget) organizerDialog.current.close(); }}>
      <div className="up-organizer-heading"><h2 id="relay-organizer-title">Organizer’s desk</h2><button aria-label="Close organizer controls" onClick={() => organizerDialog.current.close()}>×</button></div>
      <button className="up-text-button" onClick={() => { organizerDialog.current.close(); setProjecting(true); }}>Preview reveal ↗</button>
      {notice && <p role="status">{notice}</p>}
      <Organizer room={room} act={act} busy={busy} expanded />
    </dialog>}
  </>;
}

function StoryReveal({ room, projecting, setProjecting }) {
  const [count, setCount] = useState(0);
  const [names, setNames] = useState(false);
  const [reading, setReading] = useState(false);
  const stage = useRef(null);
  const story = [{ id: 'opening', sentence: room.openingSentence, name: 'The beginning' }, ...(room.story || [])].filter(item => item.sentence);
  useEffect(() => {
    if (!projecting) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [projecting]);
  function keys(e) {
    if (e.target !== stage.current) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setCount(v => Math.min(story.length,v+1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setCount(v => Math.max(0,v-1)); }
    if (e.key === 'Escape') setProjecting(false);
  }
  const visible = reading ? story : story.slice(Math.max(0,count-1),count);
  return <div className={`up-reveal${reading ? ' up-reading' : ''}`} tabIndex={0} ref={stage} onKeyDown={keys}>
    <p className="up-kicker">TSINGLAN UP / THE STORY RELAY</p>
    <div className="up-reveal-stage" aria-live="polite">{visible.length ? visible.map(item => <div key={item.id}><p>{item.sentence}</p>{names && <small>{item.name}</small>}</div>) : <h1>A story,<br /><em>unfolding.</em></h1>}</div>
    <div className="up-reveal-controls"><label><input type="checkbox" checked={names} onChange={e=>setNames(e.target.checked)} /> Names</label><button onClick={()=>setReading(!reading)}>{reading ? 'Sentence view' : 'Read all'}</button>
      {!reading && <><button disabled={!count} onClick={()=>setCount(count-1)} aria-label="Previous sentence">←</button><span>{count}/{story.length}</span><button disabled={count >= story.length} onClick={()=>setCount(count+1)} aria-label="Next sentence">Next →</button></>}
      <button onClick={()=>setProjecting(!projecting)}>{projecting ? 'Exit projection' : 'Project ↗'}</button></div>
  </div>;
}

function Marketplace({ room, act, busy, notice }) {
  const own = room.pitches.find(pitch => pitch.mine);
  const votesLeft = availableVotes(room.pitches);
  const submissionsOpen = room.submissionsOpen !== false;
  const pitches = room.phase === 'results' ? [...room.pitches].sort((a,b) => b.votes-a.votes) : room.pitches;
  return <>
    <header className="up-market-masthead"><p className="up-kicker"><span>TSINGLAN UP / ISSUE 16</span><span>{phaseLabels[room.phase]}</span></p><h1>What’s <em>next?</em><span aria-hidden="true">↗</span></h1><div className="up-market-subline"><span>THE THEME MARKETPLACE</span><i>Ideas welcome.</i></div></header>
    {room.phase === 'collecting' ? <div className="up-pitch-spread"><figure className="up-market-art"><img src={marketArt} alt="An editorial moodboard of ocean photography, botanical clippings and lavender magazine pages." /><figcaption>THE NEXT ISSUE STARTS HERE.</figcaption></figure>
      <div className="up-pitch-column"><PitchForm key={own?.id || 'new'} own={own} busy={busy} notice={notice} open={submissionsOpen} joining={!room.member && room.organizer} save={async payload => {
        if (!room.member && room.organizer && !await act('join-market')) return;
        await act('pitch',payload, 'Your pitch is saved.');
      }} /></div>
    </div> : <>
      <div className="up-market-banner"><img src={marketArt} alt="" /><div><p className="up-kicker">{room.phase === 'voting' ? 'THREE VOTES. FOLLOW YOUR CURIOSITY.' : 'INSPIRATION FOR OUR EDITORS.'}</p><p>{room.phase === 'voting' ? <><strong>{votesLeft}</strong> votes to share</> : <>The next chapter<br /><em>begins with an idea.</em></>}</p></div></div>
      <div className="up-theme-grid">{pitches.map((pitch,index)=><ThemeCard key={pitch.id} pitch={pitch} index={index}>
        {room.phase === 'voting' && room.member && <div className="up-vote-controls"><button disabled={busy || !pitch.myVotes} aria-label={`Return one vote from ${pitch.theme}`} onClick={()=>act('vote',{id:pitch.id,delta:-1})}>−</button><span>{pitch.myVotes} / your votes</span><button disabled={busy || !votesLeft} aria-label={`Give one vote to ${pitch.theme}`} onClick={()=>act('vote',{id:pitch.id,delta:1})}>+</button></div>}
        {room.phase === 'results' && <p className="up-result">{pitch.votes} <span>votes</span></p>}
      </ThemeCard>)}</div>
    </>}
    {room.phase !== 'collecting' && notice && <p className="up-notice" role="status">{notice}</p>}
    <footer className="up-colophon"><span>MADE OF POSSIBILITIES.</span><span>WRITING DEPARTMENT / 16</span></footer>
  </>;
}

function PitchForm({ own, busy, save, notice, joining, open }) {
  const [values,setValues] = useState({theme:own?.theme || '',ideaOne:own?.ideaOne || '',ideaTwo:own?.ideaTwo || ''});
  const changed = own && Object.keys(values).some(key => values[key] !== own[key]);
  const feedback = !open ? 'Submissions are closed.' : changed && (!notice || notice === 'Your pitch is saved.') ? 'Unsaved changes.' : notice || (own ? 'Saved. Edit until voting opens.' : '');
  return <form className="up-pitch-form" aria-label="Suggest a theme" onSubmit={e=>{e.preventDefault();void save(values);}}>
    {[['theme','Suggested theme','What if…',100],['ideaOne','Article title 01','First story…',200],['ideaTwo','Article title 02','Another angle…',200]].map(([key,label,placeholder,maxLength])=><div className="up-pitch-field" key={key}><label htmlFor={`pitch-${key}`}>{label}</label><textarea id={`pitch-${key}`} required rows={2} maxLength={maxLength} disabled={busy || !open} value={values[key]} placeholder={placeholder} onChange={e=>setValues({...values,[key]:e.target.value})}/></div>)}
    <div className="up-pitch-footer"><p role="status">{feedback}</p><button className="up-action" disabled={busy || !open}>{joining ? 'Join & submit' : own ? 'Save changes' : 'Submit'} <span aria-hidden="true">↗</span></button></div>
  </form>;
}

function ThemeCard({ pitch,index,children }) {
  return <article className={`up-theme-card up-theme-${index%3}`}><p className="up-kicker">PITCH / {String(index+1).padStart(2,'0')}</p><h2>{pitch.theme}</h2><div className="up-article-idea"><span>01</span><p>{pitch.ideaOne}</p></div><div className="up-article-idea"><span>02</span><p>{pitch.ideaTwo}</p></div>{children}</article>;
}

function Organizer({ room,act,busy,expanded = false }) {
  const [tab,setTab] = useState('participants');
  const [query,setQuery] = useState('');
  const [results,setResults] = useState([]);
  const [selected,setSelected] = useState(null);
  const [searchError,setSearchError] = useState('');
  const searchVersion = useRef(0);
  const participants = selected || room.participants || [];
  async function search(e) {
    e.preventDefault(); const version=++searchVersion.current; setSearchError('');
    try { const found=await findCreativeUsers(room.slug,query); if(version===searchVersion.current) setResults(found); }
    catch { if(version===searchVersion.current) setSearchError('Search failed. Please try again.'); }
  }
  const canEditParticipants = room.phase === 'draft' || room.phase === 'collecting';
  return <details className="up-organizer" open={expanded || undefined}><summary>Organizer’s desk</summary><div className="up-organizer-tabs">{['participants',...(room.kind==='relay'?['settings','queue','story']:['submissions','settings']),'controls'].map(value=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{value}</button>)}</div>
    {tab==='participants' && room.kind==='relay' && <CreativeRosterManager room={room} act={act} busy={busy} />}
    {tab==='participants' && room.kind==='market' && <><p>Selected club members.</p><ol>{participants.map((p,index)=><li key={p.id}><span>{p.name}</span>{canEditParticipants && <><button disabled={busy || index===0} aria-label={`Move ${p.name} earlier`} onClick={()=>{const next=[...participants];[next[index-1],next[index]]=[next[index],next[index-1]];setSelected(next);}}>↑</button><button disabled={busy} aria-label={`Remove ${p.name}`} onClick={()=>setSelected(participants.filter(user=>user.id!==p.id))}>×</button></>}</li>)}</ol>
      {canEditParticipants && <><form className="up-user-search" onSubmit={search}><label htmlFor="up-user-query">Find registered users</label><input id="up-user-query" minLength={2} maxLength={80} required value={query} onChange={e=>setQuery(e.target.value)} /><button>Search</button></form>{searchError && <p role="alert">{searchError}</p>}<ul>{results.map(user=><li key={user.id}><span>{user.name} <small>@{user.username}</small></span><button disabled={busy || participants.some(p=>p.id===user.id)} onClick={()=>setSelected([...participants,user])}>Add access</button></li>)}</ul><button disabled={busy || selected===null} onClick={async()=>{if(await act('participants',{ids:participants.map(p=>p.id)},'Access saved.'))setSelected(null);}}>Save access</button></>}
    </>}
    {tab==='settings' && room.kind==='relay' && <RelaySettings key={`${room.startsAt}:${room.freeAt}:${room.revealAt}`} room={room} busy={busy} act={act} />}
    {tab==='settings' && room.kind==='market' && <MarketSettings room={room} busy={busy} act={act} />}
    {tab==='submissions' && <CreativePitchAdmin room={room} />}
    {tab==='queue' && <QueueEditor key={room.queue.map(t=>t.id).join(':')} room={room} busy={busy} act={act} />}
    {tab==='story' && <CreativeStoryAdmin room={room} />}
    {tab==='controls' && <div className="up-organizer-controls">
      {room.phase==='draft' && <button disabled={busy} onClick={()=>act('start',{},'The relay is ready. The first turn opens on the start date.')}>Start relay</button>}
      {room.phase==='scheduled' && <button disabled={busy || room.queue.some(turn=>!turn.done)} onClick={()=>act('open-free')}>Open free writing</button>}
      {['scheduled','free'].includes(room.phase) && <button disabled={busy} onClick={()=>act('pause')}>Pause submissions</button>}
      {room.phase==='paused' && <button disabled={busy} onClick={()=>act('resume')}>Resume submissions</button>}
      {['scheduled','paused','free'].includes(room.phase) && <button disabled={busy} onClick={()=>act('close')}>Close submissions</button>}
      {room.phase==='closed' && <button disabled={busy} onClick={()=>act('reveal')}>Reveal story to everyone</button>}
      {room.phase==='collecting' && <button disabled={busy} onClick={()=>act('open-voting')}>Open marketplace & voting</button>}
      {room.phase==='voting' && <button disabled={busy} onClick={()=>act('close-voting')}>Close voting & reveal results</button>}
      <p>Phase: {room.phase}. All dates use Asia/Shanghai. Phase changes take effect for everyone.</p>
    </div>}
  </details>;
}

function RelaySettings({room,busy,act}) {
  const [values,setValues]=useState(Object.fromEntries(['startsAt','roundTwoAt','freeAt','revealAt'].map(key=>[key,shanghaiDateInput(room[key])])));
  const [opening,setOpening]=useState(room.openingSentence || '');
  const [turns,setTurns]=useState(room.turnsPerWriter || 2);
  return <form className="up-settings" onSubmit={e=>{e.preventDefault();void act('settings',{...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,shanghaiMidnight(v)])),openingSentence:opening,turnsPerWriter:Number(turns)},'Dates and opening saved.');}}>
    {[['startsAt','Round one'],['roundTwoAt','Round two target'],['freeAt','Free writing target'],['revealAt','Party / reveal']].map(([key,label])=><label key={key}>{label}<input type="date" required value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})}/></label>)}
    <label>Turns per writer<input type="number" required min={1} max={8} value={turns} disabled={room.phase!=='draft'} onChange={e=>setTurns(e.target.value)}/></label>
    <label htmlFor="up-opening-sentence">Opening sentence</label><textarea id="up-opening-sentence" required maxLength={1000} value={opening} disabled={room.phase!=='draft'} onChange={e=>setOpening(e.target.value)}/><button disabled={busy}>Save settings</button>
  </form>;
}
function QueueEditor({room,busy,act}) {
  const [turns,setTurns]=useState(room.queue.filter(t=>!t.done));
  function move(index,offset) { const next=[...turns]; const [turn]=next.splice(index,1);next.splice(Math.min(next.length,index+offset),0,turn);setTurns(next); }
  return <><p>Skipping defers a turn by five places. Everyone keeps their remaining turns.</p><ol>{turns.map((turn,index)=><li key={turn.id}><span>{turn.name} / R{turn.round}</span><button disabled={busy || index===0} onClick={()=>move(index,-1)} aria-label={`Move ${turn.name} earlier`}>↑</button><button disabled={busy || index===turns.length-1} onClick={()=>move(index,1)} aria-label={`Move ${turn.name} later`}>↓</button>{index===0 && <button disabled={busy || turns.length<2} onClick={()=>move(0,5)}>Skip for now</button>}</li>)}</ol><button disabled={busy || !['scheduled','paused'].includes(room.phase) || !turns.length} onClick={()=>act('reorder',{ids:turns.map(t=>t.id)},'Writing order saved.')}>Save order</button></>;
}

function MarketSettings({room,busy,act}) {
  function local(value) {
    if (!value) return '';
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  const [opens,setOpens]=useState(()=>local(room.pitchOpensAt));
  const [closes,setCloses]=useState(()=>local(room.pitchClosesAt));
  return <form className="up-settings" onSubmit={e=>{e.preventDefault();void act('market-settings',{opensAt:opens ? `${opens}:00+08:00` : null,closesAt:closes ? `${closes}:00+08:00` : null},'Submission window saved.');}}>
    <label>Opens / Shanghai<input type="datetime-local" value={opens} onChange={e=>setOpens(e.target.value)}/></label>
    <label>Closes / Shanghai<input type="datetime-local" value={closes} onChange={e=>setCloses(e.target.value)}/></label>
    <button disabled={busy || room.phase!=='collecting'}>Save window</button>
  </form>;
}
