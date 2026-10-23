export const CREATIVE_SLUGS = ['story-relay', 'theme-marketplace'];
export function sentenceValidationError(value) {
  const text = value.trim();
  if (!text) return 'Enter your sentence before submitting.';
  if (Array.from(text).length < 2 || Array.from(text).length > 1000) return 'Your sentence must contain 2–1000 characters.';
  const ending = /[.!?。！？][”’"')\]»」』}）]*$/u;
  if (!ending.test(text)) return 'End your sentence with a period, question mark, or exclamation mark.';
  const normalized = text.replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|e\.g|i\.e)\./gi, '$1');
  const chars = Array.from(normalized);
  const quoted = Array(chars.length).fill(false);
  const stack = [];
  const pairs = { '“':'”', '‘':'’', '「':'」', '『':'』', '«':'»', '"':'"', "'":"'" };
  const word = char => Boolean(char && /[\p{L}\p{N}]/u.test(char));
  for (let i=0;i<chars.length;i++) {
    const char=chars[i], top=stack.at(-1);
    if (chars[i-1]==='\\' && (char==='"' || char==="'")) continue;
    // Apostrophes in contractions and possessives are not opening quotes.
    if ((char==="'" || char==='’') && word(chars[i-1]) && word(chars[i+1])) continue;
    if (top?.end===char) {
      for (let j=top.start;j<=i;j++) quoted[j]=true;
      stack.pop();
    } else if (Object.hasOwn(pairs,char) && !(char==="'" && word(chars[i-1]))) {
      stack.push({end:pairs[char],start:i});
    }
  }
  let counted=normalized;
  // Dialogue embedded in a sentence may have its own ?! without ending the
  // surrounding sentence. A wholly quoted submission still gets counted.
  if (chars.some((char,i)=>!quoted[i] && word(char))) {
    counted=chars.map((char,i)=>quoted[i] && /[.!?。！？]/u.test(char) ? ' ' : char).join('');
    const terminal=normalized.match(ending);
    if (terminal && quoted[Array.from(normalized.slice(0,terminal.index)).length]) counted+='.';
  }
  return (counted.match(/(?:[.!?]+[”’"')\]»」』}）]*(?=\s|$)|[。！？]+[”’"')\]»」』}）]*)/gu) || []).length === 1
    ? '' : 'Write one sentence. Separate sentences outside quoted dialogue are not allowed.';
}
export function isSingleSentence(value) { return sentenceValidationError(value)===''; }

export function relaySubmissionError(error) {
  const message=error?.message || '';
  if (/turn has changed|not your turn|turn.*expired/i.test(message)) return 'Your turn has changed or expired. Check who is marked “Now” and try again when it is your turn. Your text has been kept.';
  if (error?.code==='42501') return 'This account does not have permission to submit to the relay. Sign in with the invited writer’s account. Your text has been kept.';
  if (/jwt|session.*expired|not authenticated/i.test(message) || error?.status===401) return 'Your login session has expired. Sign in again, then retry. Your text has been kept.';
  if (/failed to fetch|fetch failed|networkerror|load failed/i.test(message)) return 'The connection failed. Check your internet connection and try again. Your text has been kept.';
  return message || 'Your sentence could not be submitted. Please try again. Your text has been kept.';
}
export function relayProgress(queue) {
  const remaining = queue.filter(turn => !turn.done);
  return { completed: queue.length - remaining.length, total: queue.length, remaining, current: remaining.some(turn => Object.hasOwn(turn, 'current')) ? remaining.find(turn => turn.current) : remaining.find(turn => turn.userId !== null) };
}
export function shanghaiDateInput(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function shanghaiMidnight(value) { return `${value}T00:00:00+08:00`; }
export function availableVotes(pitches) { return 3 - pitches.reduce((sum, pitch) => sum + pitch.myVotes, 0); }

export function orderedWriterSlots(slots) {
  const pinned = slots.filter(slot => slot.pinned);
  const remaining = slots.filter(slot => !slot.pinned);
  return [...pinned, ...remaining.filter(slot => slot.id), ...remaining.filter(slot => !slot.id)];
}
export function compiledRelayStory(room) {
  return [room.openingSentence, ...(room.story || []).map(item => item.sentence)].filter(Boolean).join(' ');
}
