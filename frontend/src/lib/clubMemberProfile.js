export const CLUB_NICKNAME_MAX_LENGTH = 30;
export function getClubMemberName(member, fallback = '') {
  return member?.nickname || member?.username || member?.accountName || member?.name || fallback;
}
export function validateClubNickname(value) {
  const nickname = String(value || '').trim();
  if (Array.from(nickname).length > CLUB_NICKNAME_MAX_LENGTH || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(nickname)) return 'nicknameInvalid';
  if (/^(host|admin|administrator|moderator|system|主持人|管理员|系統|系统)$/iu.test(nickname)) return 'nicknameReserved';
  return null;
}

export function getClubMemberTags(community, userId) {
  const selected = new Set(community.assignments.filter(row => row.user_id === userId).map(row => String(row.tag_id)));
  return community.tags.filter(tag => selected.has(String(tag.id))).slice(0, 3);
}
export function getClubTagClass(tag) {
  const hash = Array.from(String(tag.id ?? tag.name)).reduce((value, character) => (value * 31 + character.codePointAt(0)) >>> 0, 0);
  return `cr-identity-tag cr-tag-${['rose', 'gold', 'sage', 'beige'][hash % 4]}`;
}
