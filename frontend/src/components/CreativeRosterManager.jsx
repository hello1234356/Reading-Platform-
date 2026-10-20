import { useState } from 'react';
import { findCreativeUsers, matchCreativeWriters } from '../lib/creativeEventsApi';
import { orderedWriterSlots } from '../lib/creativeEventsModel';

export default function CreativeRosterManager({ room, act, busy }) {
  const [draft, setDraft] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const rows = draft || room.rosterSlots || [];
  const editable = room.phase === 'draft' || room.phase === 'scheduled' || (room.phase === 'paused' && room.pausedPhase === 'scheduled');
  const pending = rows.filter(row => !row.id);
  function update(index, changes) { setDraft(rows.map((row,i) => i === index ? {...row,...changes} : row)); }
  function pinned(row) { return Boolean(row.pinned || (row.id && (row.id === room.firstWriterId || row.id === room.secondWriterId))); }
  async function match() {
    setLoading(true); setError('');
    try {
      const matches = await matchCreativeWriters();
      setDraft(orderedWriterSlots(matches.map(row => ({...row,id:row.proposedId || null}))));
      setConfirming(true);
    } catch { setError('Account matching could not load. Please try again.'); }
    finally { setLoading(false); }
  }
  async function search(e) {
    e.preventDefault(); setLoading(true); setError('');
    try { setFound(await findCreativeUsers(room.slug,query)); }
    catch { setError('Account search failed. Please try again.'); }
    finally { setLoading(false); }
  }
  async function save() {
    const slots = orderedWriterSlots(rows);
    const ids = slots.map(row=>row.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) { setError('Choose each existing account only once.'); return; }
    if (await act('save-writer-slots',{slots:slots.map(({slotId,id,name,studentId})=>({slotId,id,name,studentId})),confirm:confirming},'Roster saved. Pending accounts stay at the bottom.')) {
      setDraft(null);setConfirming(false);setError('');
    }
  }
  function choose(user) {
    if (target === null) setDraft([...rows,{id:user.id,name:user.name,candidates:[user]}]);
    else update(target,{id:user.id,candidates:[...new Map([...(rows[target].candidates || []),user].map(candidate=>[candidate.id,candidate])).values()],status:'manual'});
    setFound([]);
  }
  return <section className="creative-roster-manager" aria-label="Writing roster account matching">
    <p>{rows.length} writers · {rows.length * (room.turnsPerWriter || 2)} scheduled turns. Pending accounts keep their places.</p>
    {editable && <button disabled={busy || loading} onClick={match}>Match the requested writing roster</button>}
    <ol>{rows.map((row,index) => {
      const candidates = row.candidates || (row.id ? [{id:row.id,name:row.name}] : []);
      return <li key={row.slotId || row.name}>
        <div className="creative-roster-identity"><strong>{index+1}. {row.name}</strong>{row.studentId && <small>{row.studentId}</small>}
          {!row.id && <small>{row.status==='ambiguous' ? 'Ambiguous — choose an account' : 'Account pending'}</small>}
        </div>
        {editable && <>
          <label className="sr-only" htmlFor={`writer-match-${index}`}>Existing account for {row.name}</label>
          <select id={`writer-match-${index}`} value={row.id || ''} onChange={e=>update(index,{id:e.target.value || null})} disabled={busy}>
            <option value="">Account pending</option>
            {candidates.map(user=><option key={user.id} value={user.id}>{user.name}{user.username ? ` @${user.username}` : ''}{user.email ? ` · ${user.email}` : ''}</option>)}
          </select>
          <button disabled={busy || loading} onClick={()=>{setTarget(index);setQuery(row.name);setFound([]);}}>Find account</button>
          <button aria-label={`Move ${row.name} earlier`} disabled={busy || index<=2 || pinned(row) || (!row.id && rows[index-1]?.id)} onClick={()=>{const next=[...rows];[next[index-1],next[index]]=[next[index],next[index-1]];setDraft(next);}}>↑</button>
          <button aria-label={`Remove ${row.name}`} disabled={busy || pinned(row)} onClick={()=>setDraft(rows.filter((_,i)=>i!==index))}>×</button>
        </>}
      </li>;
    })}</ol>
    {pending.length>0 && <p role="status">Account pending: {pending.map(row=>row.name).join(', ')}.</p>}
    {editable && <>
      <form className="up-user-search" onSubmit={search}>
        <label htmlFor="writer-account-query">{target===null ? 'Add an existing writer' : `Find ${rows[target]?.name || 'writer'}’s existing account`}</label>
        <input id="writer-account-query" value={query} onChange={e=>setQuery(e.target.value)} required minLength={2} maxLength={80}/>
        <button disabled={busy || loading}>Search</button>
        {target!==null && <button type="button" onClick={()=>{setTarget(null);setFound([]);setQuery('');}}>Add another writer</button>}
      </form>
      <ul>{found.map(user=><li key={user.id}><span>{user.name} <small>{user.email || user.username}</small></span><button disabled={busy || rows.some((row,i)=>row.id===user.id && i!==target)} onClick={()=>choose(user)}>Use this account</button></li>)}</ul>
      <button disabled={busy || !draft || (confirming && rows.slice(0,2).some(row=>!row.id))} onClick={save}>Confirm roster & access</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
