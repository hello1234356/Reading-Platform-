export function findClubMentionQuery(text, caret) {
  const match = text.slice(0, caret).match(/(^|[^\p{L}\p{N}_.+-])@([^@\n]{0,40})$/u);
  return match ? { start: caret - match[2].length - 1, end: caret, query: match[2].toLocaleLowerCase() } : null;
}
export function clubMentionSuggestions(members, query) {
  return members.filter(member => member.username && [member.username, member.nickname].some(name => name?.toLocaleLowerCase().includes(query))).slice(0, 8);
}
export function splitClubMentions(text, mentions = []) {
  if (!mentions.length) return [text];
  const names = mentions.map(item => item.username).filter(Boolean).sort((a,b)=>b.length-a.length);
  if (!names.length) return [text];
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const regex = new RegExp(`(^|[^\\p{L}\\p{N}_.+\\-])@(${escaped})(?=$|[^\\p{L}\\p{N}_.\\-])`,'gu');
  const parts=[];let cursor=0;
  for (const match of text.matchAll(regex)) {
    const start=match.index+match[1].length;
    if(start>cursor)parts.push(text.slice(cursor,start));
    parts.push({...mentions.find(item=>item.username===match[2]),text:`@${match[2]}`});
    cursor=match.index+match[0].length;
  }
  if(cursor<text.length)parts.push(text.slice(cursor));
  return parts;
}
