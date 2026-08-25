import type {
  AssessmentStatus,
  Classification,
  EvidenceQuality,
  IncomingBook,
} from "./schema.ts";

export const POLICY_VERSION = "school-books-2026-08-v3";
export const MODERATION_MODE = "enforce" as const;
export const MEANINGFUL_TARGET_LEVEL = 2;

export const targetLevels = (ai: Classification) => [
  ai.sexual_content, ai.extremism, ai.china_political_sensitivity,
];

export function needsWebEnrichment(ai: Classification): boolean {
  return ai.needs_web_enrichment || ai.recommendation === "enrich" ||
    targetLevels(ai).some((level) => level === 1);
}

export function shouldEnrichBook(ai: Classification, book: Pick<IncomingBook,
  "title" | "description" | "categories" | "subjects">): boolean {
  if (!needsWebEnrichment(ai)) return false;
  const hasSignal = targetLevels(ai).some((level) => level > 0);
  const referenceText = [book.title, book.description, ...book.categories, ...book.subjects]
    .join(" ").toLowerCase();
  const plainlyReference = /\b(encyclop(?:a)?edia|dictionary|reference work|bibliograph(?:y|ic)|handbook)\b/
    .test(referenceText);
  return hasSignal || !plainlyReference;
}

export function applyPolicy(
  ai: Classification,
  evidenceQuality: EvidenceQuality = ai.evidence_quality,
): AssessmentStatus {
  if (!ai.recognized && evidenceQuality === "very_low") return "review_required";
  return targetLevels(ai).some((level) => level >= MEANINGFUL_TARGET_LEVEL)
    ? "review_required" : "approved";
}

export function applyEnrichmentFailurePolicy(ai: Classification): AssessmentStatus {
  return targetLevels(ai).some((level) => level >= MEANINGFUL_TARGET_LEVEL)
    ? "review_required" : "error";
}

export function reviewReason(
  ai: Classification,
  evidenceQuality: EvidenceQuality = ai.evidence_quality,
): string {
  if (!ai.recognized && evidenceQuality === "very_low") {
    return "Insufficient evidence: the exact title and author could not be identified reliably.";
  }
  if (ai.sexual_content >= MEANINGFUL_TARGET_LEVEL) {
    return `Sexual content: ${ai.reasoning_summary}`;
  }
  if (ai.extremism >= MEANINGFUL_TARGET_LEVEL) {
    return `Extremist advocacy or propaganda: ${ai.reasoning_summary}`;
  }
  if (ai.china_political_sensitivity >= MEANINGFUL_TARGET_LEVEL) {
    return `China-related political sensitivity: ${ai.reasoning_summary}`;
  }
  return ai.reasoning_summary;
}

export function reviewCategory(
  ai: Classification,
  enrichmentFailed?: boolean,
): "content_review" | "insufficient_evidence" | "policy_uncertainty";
export function reviewCategory(
  ai: Classification,
  evidenceQuality: EvidenceQuality,
  enrichmentFailed?: boolean,
): "content_review" | "insufficient_evidence" | "policy_uncertainty";
export function reviewCategory(
  ai: Classification,
  evidenceQualityOrEnrichmentFailed: EvidenceQuality | boolean = ai.evidence_quality,
  enrichmentFailed = false,
): "content_review" | "insufficient_evidence" | "policy_uncertainty" {
  const evidenceQuality = typeof evidenceQualityOrEnrichmentFailed === "boolean"
    ? ai.evidence_quality : evidenceQualityOrEnrichmentFailed;
  const didEnrichmentFail = typeof evidenceQualityOrEnrichmentFailed === "boolean"
    ? evidenceQualityOrEnrichmentFailed : enrichmentFailed;
  if (!ai.recognized && evidenceQuality === "very_low") return "insufficient_evidence";
  if (didEnrichmentFail) return "policy_uncertainty";
  return "content_review";
}
