import { moderationIdentity, type EvidenceQuality, type IncomingBook } from "./schema.ts";

export type EvidencePacket = IncomingBook & { evidenceQuality: EvidenceQuality };
export const MODERATION_ERROR_RETRY_BACKOFF_MS = 60_000;
const DURABLE_ASSESSMENT_STATUSES = new Set(["approved", "review_required", "blocked"]);

const assessmentTimestamp = (assessment: Record<string, unknown>) => {
  for (const field of ["reviewed_at", "updated_at", "created_at"]) {
    const parsed = Date.parse(String(assessment[field] || ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

export function selectEffectiveAssessments(
  rows: Record<string, unknown>[],
  currentPolicyVersion: string,
) {
  const grouped = new Map<string, Record<string, unknown>[]>();
  rows.forEach((row) => {
    const source = String(row.source || "").trim();
    const externalId = String(row.external_id || "").trim();
    if (!source || !externalId) return;
    const identity = moderationIdentity(source, externalId);
    grouped.set(identity, [...(grouped.get(identity) || []), row]);
  });

  const selected = new Map<string, Record<string, unknown>>();
  grouped.forEach((assessments, identity) => {
    const manual = assessments
      .filter((assessment) => assessment.manually_reviewed === true &&
        DURABLE_ASSESSMENT_STATUSES.has(String(assessment.status || "")))
      .sort((first, second) => assessmentTimestamp(second) - assessmentTimestamp(first))[0];
    if (manual) {
      selected.set(identity, manual);
      return;
    }
    const current = assessments
      .filter((assessment) => assessment.policy_version === currentPolicyVersion)
      .sort((first, second) => assessmentTimestamp(second) - assessmentTimestamp(first))[0];
    if (current) selected.set(identity, current);
  });
  return selected;
}

export function assessEvidenceQuality(book: IncomingBook): EvidenceQuality {
  const rawDescription = book.description || "";
  const descriptionLength = /does not have an official description/i.test(rawDescription)
    ? 0 : rawDescription.length;
  const supporting = [book.publisher, book.publicationYear, book.isbn, book.language,
    book.maturityRating].filter(Boolean).length;
  const topical = book.categories.length + book.subjects.length;
  if (descriptionLength >= 500 && supporting >= 2 && topical >= 2) return "high";
  if (descriptionLength >= 180 && (supporting >= 1 || topical >= 1)) return "medium";
  if (descriptionLength >= 60 || topical >= 2 || (book.authors.length > 0 && supporting >= 2)) return "low";
  return "very_low";
}

export function buildEvidencePacket(incoming: IncomingBook, stored?: Record<string, unknown>): EvidencePacket {
  const storedAuthor = String(stored?.author || "").trim();
  const storedBookId = Number(stored?.id);
  const merged: IncomingBook = {
    ...incoming,
    // A client-supplied bookId is only a lookup hint. The persisted foreign key
    // must come from a database row whose provider identity matched.
    bookId: Number.isSafeInteger(storedBookId) && storedBookId > 0
      ? storedBookId : undefined,
    subtitle: stored ? "" : incoming.subtitle,
    title: String(stored?.title || "").trim() || incoming.title,
    authors: storedAuthor ? [storedAuthor] : incoming.authors,
    description: String(stored?.description || "").trim() || incoming.description,
    categories: String(stored?.genre || "").trim()
      ? [String(stored?.genre).trim()] : incoming.categories,
    subjects: stored ? [] : incoming.subjects,
    publisher: String(stored?.publisher || "").trim() || incoming.publisher,
    publicationYear: Number(stored?.publication_year) || incoming.publicationYear,
    isbn: String(stored?.isbn || "").trim() || incoming.isbn,
    language: String(stored?.language || "").trim() || incoming.language,
    coverUrl: String(stored?.cover_url || "").trim() || incoming.coverUrl,
    maturityRating: stored ? "" : incoming.maturityRating,
    providerMetadata: stored ? {} : incoming.providerMetadata,
  };
  return { ...merged, evidenceQuality: assessEvidenceQuality(merged) };
}

export function safeEvidenceForStorage(packet: EvidencePacket) {
  return {
    title: packet.title, subtitle: packet.subtitle || "", authors: packet.authors,
    description: packet.description || "", categories: packet.categories, subjects: packet.subjects,
    publisher: packet.publisher || "", publicationYear: packet.publicationYear || null,
    isbn: packet.isbn || "", maturityRating: packet.maturityRating || "",
    language: packet.language || "", providerMetadata: packet.providerMetadata || {},
    coverUrl: packet.coverUrl || "",
  };
}

export function planBookAssessments(
  books: IncomingBook[],
  cachedByIdentity: Map<string, Record<string, unknown>>,
  storedByIdentity: Map<string, Record<string, unknown>>,
  now = Date.now(),
) {
  const cached = new Map<string, Record<string, unknown>>();
  const unknown: EvidencePacket[] = [];
  books.forEach((book) => {
    const identity = moderationIdentity(book.source, book.externalId);
    const assessment = cachedByIdentity.get(identity);
    const storedEvidence = storedByIdentity.get(identity);
    const packet = buildEvidencePacket(book, storedEvidence);
    const qualityRank: Record<string, number> = {
      insufficient: 0, very_low: 0, low: 1, medium: 2, high: 3,
    };
    // Client metadata can only request a fresh provider check; index.ts replaces
    // it with canonical evidence before classification or persistence.
    const evidenceImproved = assessment && !assessment.manually_reviewed &&
      qualityRank[packet.evidenceQuality] > qualityRank[String(assessment.evidence_quality || "very_low")];
    const updatedAt = Date.parse(String(assessment?.updated_at || ""));
    const retryBackoffActive = assessment?.status === "error" &&
      !assessment.manually_reviewed && Number.isFinite(updatedAt) &&
      now - updatedAt < MODERATION_ERROR_RETRY_BACKOFF_MS;
    const durableDecision = assessment &&
      DURABLE_ASSESSMENT_STATUSES.has(String(assessment.status || ""));
    if (assessment && !evidenceImproved &&
      (durableDecision || retryBackoffActive)) {
      cached.set(identity, assessment);
    } else {
      unknown.push(packet);
    }
  });
  return { cached, unknown };
}
