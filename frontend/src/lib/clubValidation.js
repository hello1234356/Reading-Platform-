// Shared by club creation and the in-room settings form.
export function validateClubDetails({ title, description, duration, membersWanted, tags = [] }, memberCount = 1) {
  if (!String(title || '').trim() || String(title).trim().length > 100) return 'nameInvalid';
  if (!String(description || '').trim() || String(description).length > 350) return 'descriptionInvalid';
  if (!String(duration || '').trim() || String(duration).length > 100) return 'durationInvalid';
  if (!Number.isInteger(Number(membersWanted)) || Number(membersWanted) < Math.max(1, memberCount)) return 'capacityInvalid';
  if (tags.length > 10 || tags.some(tag => String(tag).trim().length > 30)) return 'tagsInvalid';
  return null;
}
export function parseClubTags(value) {
  return [...new Set(String(value).split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
}
export function mergeClubMessages(existing, incoming) {
  return [...new Map([...existing, ...incoming].map(row => [String(row.id), row])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}
