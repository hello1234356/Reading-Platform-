export function isClubChatAtLatest(element) {
  return Boolean(element && element.scrollHeight - element.scrollTop - element.clientHeight <= 12);
}
