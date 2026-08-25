export const MAX_BATCH_SIZE = 10;
export const ALLOWED_SOURCES = new Set([
  "google_books", "open_library", "isbn_work", "community",
]);

export type EvidenceQuality = "high" | "medium" | "low" | "very_low";
export type AssessmentStatus = "approved" | "review_required" | "blocked" | "error";
export type Recommendation = "approve" | "enrich" | "review_required";

export type IncomingBook = {
  bookId?: number;
  source: string;
  externalId: string;
  title: string;
  subtitle?: string;
  authors: string[];
  description?: string;
  categories: string[];
  subjects: string[];
  publisher?: string;
  publicationYear?: number;
  isbn?: string;
  maturityRating?: string;
  language?: string;
  coverUrl?: string;
  providerMetadata?: Record<string, unknown>;
};

export type Classification = {
  recommendation: Recommendation;
  recognized: boolean;
  identity_confidence: number;
  moderation_confidence: number;
  knowledge_source: "provider_evidence" | "model_prior_knowledge" | "combined";
  evidence_quality: EvidenceQuality;
  sexual_content: number;
  extremism: number;
  china_political_sensitivity: number;
  needs_web_enrichment: boolean;
  enrichment_reason: string;
  flags: string[];
  synopsis: string;
  themes: string[];
  reasoning_summary: string;
};

export type IdentifiedClassification = Classification & {
  source: string;
  externalId: string;
};

export type BatchClassificationValidation = {
  valid: Map<string, IdentifiedClassification>;
  errors: Map<string, string>;
  rejectedIdentities: string[];
};

export const moderationIdentity = (source: string, externalId: string) =>
  `${source}\u0000${externalId}`;

const text = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
const strings = (value: unknown, maxItems: number, maxLength: number) =>
  Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean)
    : [];

export function validateRequestBody(body: unknown): IncomingBook[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { books?: unknown }).books)) {
    throw new Error("Request body must contain a books array.");
  }
  const rows = (body as { books: unknown[] }).books;
  if (rows.length < 1 || rows.length > MAX_BATCH_SIZE) {
    throw new Error(`books must contain between 1 and ${MAX_BATCH_SIZE} items.`);
  }

  const seen = new Set<string>();
  return rows.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`books[${index}] must be an object.`);
    const item = raw as Record<string, unknown>;
    const source = text(item.source, 40).toLowerCase();
    const bookId = Number(item.bookId);
    let externalId = text(item.externalId, 300);
    if (source === "community" && !externalId && Number.isSafeInteger(bookId) && bookId > 0) {
      externalId = `book:${bookId}`;
    }
    if (!ALLOWED_SOURCES.has(source)) throw new Error(`books[${index}].source is unsupported.`);
    if (!externalId) throw new Error(`books[${index}].externalId is required.`);
    const identity = `${source}\u0000${externalId}`;
    if (seen.has(identity)) throw new Error(`books[${index}] duplicates another provider identity.`);
    seen.add(identity);

    const title = text(item.title, 500);
    if (!title) throw new Error(`books[${index}].title is required.`);
    const year = Number(item.publicationYear);
    return {
      bookId: Number.isSafeInteger(bookId) && bookId > 0 ? bookId : undefined,
      source, externalId, title,
      subtitle: text(item.subtitle, 500),
      authors: strings(item.authors, 20, 300),
      description: text(item.description, 12000),
      categories: strings(item.categories, 40, 200),
      subjects: strings(item.subjects, 80, 200),
      publisher: text(item.publisher, 300),
      publicationYear: Number.isInteger(year) && year >= 0 && year <= 3000 ? year : undefined,
      isbn: text(item.isbn, 32).replace(/[^0-9Xx]/g, "").toUpperCase(),
      maturityRating: text(item.maturityRating, 100),
      language: text(item.language, 40),
      coverUrl: text(item.coverUrl, 2000),
      providerMetadata: item.providerMetadata && typeof item.providerMetadata === "object"
        ? item.providerMetadata as Record<string, unknown> : undefined,
    };
  });
}

const score = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;

export function validateClassification(value: unknown): Classification {
  if (!value || typeof value !== "object") throw new Error("AI response is not an object.");
  const row = value as Record<string, unknown>;
  const recommendations = ["approve", "enrich", "review_required"];
  const dimensions = ["sexual_content", "extremism", "china_political_sensitivity"];
  if (!recommendations.includes(String(row.recommendation))) throw new Error("Invalid AI recommendation.");
  if (typeof row.recognized !== "boolean") throw new Error("Invalid recognition result.");
  for (const key of ["identity_confidence", "moderation_confidence"]) {
    if (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0 || Number(row[key]) > 1) {
      throw new Error(`Invalid ${key}.`);
    }
  }
  const knowledgeSources = ["provider_evidence", "model_prior_knowledge", "combined"];
  if (!knowledgeSources.includes(String(row.knowledge_source))) throw new Error("Invalid knowledge source.");
  const evidenceQualities = ["high", "medium", "low", "very_low"];
  if (!evidenceQualities.includes(String(row.evidence_quality))) throw new Error("Invalid evidence quality.");
  if (dimensions.some((key) => !score(row[key]))) throw new Error("Invalid AI risk score.");
  if (typeof row.needs_web_enrichment !== "boolean") throw new Error("Invalid enrichment result.");
  if (!Array.isArray(row.flags) || row.flags.some((flag) => typeof flag !== "string")) {
    throw new Error("Invalid AI flags.");
  }
  return {
    recommendation: row.recommendation as Recommendation,
    recognized: row.recognized,
    identity_confidence: Number(row.identity_confidence),
    moderation_confidence: Number(row.moderation_confidence),
    knowledge_source: row.knowledge_source as Classification["knowledge_source"],
    evidence_quality: row.evidence_quality as EvidenceQuality,
    sexual_content: Number(row.sexual_content), extremism: Number(row.extremism),
    china_political_sensitivity: Number(row.china_political_sensitivity),
    needs_web_enrichment: row.needs_web_enrichment,
    enrichment_reason: text(row.enrichment_reason, 400),
    flags: row.flags.slice(0, 20).map((flag) => String(flag).slice(0, 120)),
    synopsis: text(row.synopsis, 1000),
    themes: strings(row.themes, 30, 120),
    reasoning_summary: text(row.reasoning_summary, 600),
  };
}

export function validateBatchClassification(
  value: unknown,
  expectedBooks: Array<{ source: string; externalId: string }>,
): BatchClassificationValidation {
  const valid = new Map<string, IdentifiedClassification>();
  const errors = new Map<string, string>();
  const rejectedIdentities: string[] = [];
  const expected = new Map(expectedBooks.map((book) => [
    moderationIdentity(book.source, book.externalId), book,
  ]));
  const results = value && typeof value === "object"
    ? (value as { results?: unknown }).results : undefined;
  if (!Array.isArray(results)) {
    expected.forEach((_book, identity) => errors.set(identity, "missing_batch_results"));
    return { valid, errors, rejectedIdentities };
  }

  const returnedCounts = new Map<string, number>();
  results.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      rejectedIdentities.push(`malformed:${index}`);
      return;
    }
    const row = raw as Record<string, unknown>;
    const source = text(row.source, 40).toLowerCase();
    const externalId = text(row.external_id, 300);
    const identity = moderationIdentity(source, externalId);
    if (!expected.has(identity)) {
      rejectedIdentities.push(identity || `missing_identity:${index}`);
      return;
    }
    returnedCounts.set(identity, (returnedCounts.get(identity) || 0) + 1);
    if ((returnedCounts.get(identity) || 0) > 1) {
      valid.delete(identity);
      errors.set(identity, "duplicate_identity");
      return;
    }
    try {
      valid.set(identity, { source, externalId, ...validateClassification(row) });
    } catch {
      errors.set(identity, "invalid_classification");
    }
  });

  expected.forEach((_book, identity) => {
    if (!valid.has(identity) && !errors.has(identity)) errors.set(identity, "missing_identity");
  });
  return { valid, errors, rejectedIdentities };
}
