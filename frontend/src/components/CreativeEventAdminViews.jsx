import { useState } from 'react';
import { compiledRelayStory } from '../lib/creativeEventsModel';

function timestamp(value) {
  return value ? new Intl.DateTimeFormat('en', { timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short' }).format(new Date(value)) : 'Not recorded';
}
export function CreativeStoryAdmin({ room }) {
  const [view,setView] = useState('annotated');
  const [copied,setCopied] = useState('');
  const story = compiledRelayStory(room);
  const rows = [{id:'opening',name:'Opening prompt',sentence:room.openingSentence},...(room.story || [])];
  async function copy() {
    try { await navigator.clipboard.writeText(story);setCopied('Story copied.'); }
    catch { setCopied('Copy unavailable. Select the reading text to copy it.'); }
  }
  return <section aria-label="Private complete story">
    <div className="up-organizer-tabs"><button aria-pressed={view==='annotated'} onClick={()=>setView('annotated')}>Annotated</button><button aria-pressed={view==='reading'} onClick={()=>setView('reading')}>Reading</button><button disabled={!story} onClick={copy}>Copy story</button></div>
    {copied && <p role="status">{copied}</p>}
    {view==='reading' ? <p className="creative-compiled-story">{story || 'No story yet.'}</p> : <div className="creative-admin-table"><table><thead><tr><th>#</th><th>Writer</th><th>Sentence</th><th>Shanghai time</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.id}><td>{index}</td><td title={row.authorId || ''}>{row.name}</td><td>{row.sentence || 'Not set'}</td><td>{index===0 ? 'Opening prompt' : timestamp(row.createdAt)}</td></tr>)}</tbody></table></div>}
  </section>;
}
export function CreativePitchAdmin({ room }) {
  return <section aria-label="Theme submissions by author"><div className="creative-admin-table"><table><thead><tr><th>Submitted by</th><th>Theme</th><th>Article title 01</th><th>Article title 02</th><th>Shanghai time</th></tr></thead><tbody>{room.pitches.map(pitch=><tr key={pitch.id}><td title={pitch.authorId || ''}>{pitch.authorName || 'Author unavailable'}</td><td>{pitch.theme}</td><td>{pitch.ideaOne}</td><td>{pitch.ideaTwo}</td><td>{timestamp(pitch.createdAt)}</td></tr>)}</tbody></table></div>{!room.pitches.length && <p>No submissions yet.</p>}</section>;
}
