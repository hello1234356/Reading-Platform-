export const CREATIVE_SLUGS = ['story-relay', 'theme-marketplace'];
export function isSingleSentence(value) {
  const text = value.trim();
  const normalized = text.replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|e\.g|i\.e)\./gi, '$1');
  return text.length >= 2 && text.length <= 1000 && /[.!?。！？][”’"')]*$/.test(text)
    && (normalized.match(/(?:[.!?]+[”’"')]*(?=\s|$)|[。！？]+[”’"')]*)/g) || []).length === 1;
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
