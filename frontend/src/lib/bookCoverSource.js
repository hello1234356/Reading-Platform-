export function normalizeBookCoverSource(coverUrl) {
  return String(coverUrl || "").trim();
}

export function getBookCoverSourceAfterError() {
  return "";
}
