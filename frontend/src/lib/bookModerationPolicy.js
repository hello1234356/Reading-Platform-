export const CURRENT_BOOK_MODERATION_POLICY_VERSION = "school-books-2026-08-v3";

function rowTime(row) {
  const reviewedAt = Date.parse(String(row?.reviewed_at || ""));
  const updatedAt = Date.parse(String(row?.updated_at || ""));
  const createdAt = Date.parse(String(row?.created_at || ""));

  if (row?.manually_reviewed && Number.isFinite(reviewedAt)) return reviewedAt;
  if (Number.isFinite(updatedAt)) return updatedAt;
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function newest(first, second) {
  if (!first) return second;
  return rowTime(second) > rowTime(first) ? second : first;
}

/**
 * Resolve the one decision that currently governs each provider identity.
 * A human decision is authoritative across automated policy versions. When
 * there is no active human override, only the current automated policy row is
 * effective; older automated rows remain history.
 */
export function resolveEffectiveBookModerationRows(
  rows = [],
  policyVersion = CURRENT_BOOK_MODERATION_POLICY_VERSION,
) {
  const grouped = new Map();

  rows.forEach((row) => {
    const source = String(row?.source || "").trim();
    const externalId = String(row?.external_id || "").trim();
    if (!source || !externalId) return;

    const identity = `${source}\u0000${externalId}`;
    const group = grouped.get(identity) || { manual: null, current: null };
    if (row.manually_reviewed) group.manual = newest(group.manual, row);
    if (row.policy_version === policyVersion) group.current = newest(group.current, row);
    grouped.set(identity, group);
  });

  return [...grouped.values()]
    .map(({ manual, current }) => manual || current)
    .filter(Boolean)
    .sort((first, second) => rowTime(second) - rowTime(first));
}
