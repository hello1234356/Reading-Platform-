import { moderationIdentity, type EvidenceQuality, type IncomingBook } from "./schema.ts";

export type EvidencePacket = IncomingBook & { evidenceQuality: EvidenceQuality };

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
  const merged: IncomingBook = {
    ...incoming,
    bookId: incoming.bookId || (Number(stored?.id) || undefined),
    title: incoming.title || String(stored?.title || ""),
    authors: incoming.authors.length ? incoming.authors : storedAuthor ? [storedAuthor] : [],
    description: incoming.description || String(stored?.description || ""),
    categories: incoming.categories.length ? incoming.categories : String(stored?.genre || "") ? [String(stored?.genre)] : [],
    publisher: incoming.publisher || String(stored?.publisher || ""),
    publicationYear: incoming.publicationYear || (Number(stored?.publication_year) || undefined),
    isbn: incoming.isbn || String(stored?.isbn || ""),
    language: incoming.language || String(stored?.language || ""),
    coverUrl: incoming.coverUrl || String(stored?.cover_url || ""),
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
) {
  const cached = new Map<string, Record<string, unknown>>();
  const unknown: EvidencePacket[] = [];
  books.forEach((book) => {
    const identity = moderationIdentity(book.source, book.externalId);
    const assessment = cachedByIdentity.get(identity);
    const packet = buildEvidencePacket(book, storedByIdentity.get(identity));
    const qualityRank: Record<string, number> = {
      insufficient: 0, very_low: 0, low: 1, medium: 2, high: 3,
    };
    const evidenceImproved = assessment && !assessment.manually_reviewed &&
      qualityRank[packet.evidenceQuality] > qualityRank[String(assessment.evidence_quality || "very_low")];
    if (assessment && !evidenceImproved && (assessment.status !== "error" || assessment.manually_reviewed)) {
      cached.set(identity, assessment);
    } else {
      unknown.push(packet);
    }
  });
  return { cached, unknown };
}
