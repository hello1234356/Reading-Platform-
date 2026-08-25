import type { AssessmentStatus, Classification, IncomingBook } from "./schema.ts";

export const POLICY_VERSION = "school-books-2026-08-v2";
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

export function applyPolicy(ai: Classification): AssessmentStatus {
  if (!ai.recognized && ai.evidence_quality === "very_low") return "review_required";
  return targetLevels(ai).some((level) => level >= MEANINGFUL_TARGET_LEVEL)
    ? "review_required" : "approved";
}

export function applyEnrichmentFailurePolicy(ai: Classification): AssessmentStatus {
  return targetLevels(ai).some((level) => level >= MEANINGFUL_TARGET_LEVEL)
    ? "review_required" : "error";
}

export function reviewReason(ai: Classification): string {
  if (!ai.recognized && ai.evidence_quality === "very_low") {
    return "Insufficient evidence: the exact title and author could not be identified reliably.";
  }
  if (ai.sexual_content > 0) return `Sexual content: ${ai.reasoning_summary}`;
  if (ai.extremism > 0) return `Extremist advocacy or propaganda: ${ai.reasoning_summary}`;
  if (ai.china_political_sensitivity > 0) {
    return `China-related political sensitivity: ${ai.reasoning_summary}`;
  }
  return ai.reasoning_summary;
}

export function reviewCategory(ai: Classification, enrichmentFailed = false):
  "content_review" | "insufficient_evidence" | "policy_uncertainty" {
  if (!ai.recognized && ai.evidence_quality === "very_low") return "insufficient_evidence";
  if (enrichmentFailed) return "policy_uncertainty";
  return "content_review";
}
