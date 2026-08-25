import type { AssessmentStatus, Classification, EvidenceQuality } from "./schema.ts";

export const POLICY_VERSION = "school-display-v2-evidence-ladder-2026-08-25";
export const MODERATION_MODE = "observe" as const;
export const MIN_APPROVAL_CONFIDENCE = 0.78;
export const MIN_IDENTITY_CONFIDENCE = 0.75;
export const CLEAR_BLOCK_CONFIDENCE = 0.9;

export function applyPolicy(ai: Classification, evidence: EvidenceQuality): AssessmentStatus {
  if (!ai.recognized || ai.identity_confidence < MIN_IDENTITY_CONFIDENCE) return "review_required";
  if (ai.moderation_confidence < MIN_APPROVAL_CONFIDENCE) return "review_required";
  if (ai.political_or_regulatory_sensitivity >= 3) return "review_required";
  const nonPoliticalRisks = [ai.sexual_content, ai.violence, ai.self_harm,
    ai.drugs_or_gambling, ai.hate_or_extremism, ai.age_suitability];
  if (nonPoliticalRisks.some((risk) => risk >= 4) && ai.recommendation === "block" &&
    ai.moderation_confidence >= CLEAR_BLOCK_CONFIDENCE) {
    return "blocked";
  }
  if (ai.recommendation === "block" || ai.recommendation === "review_required") return "review_required";
  if (ai.recommendation === "approve" && (evidence !== "very_low" ||
    ai.knowledge_source === "model_prior_knowledge" || ai.knowledge_source === "combined")) return "approved";
  return "review_required";
}
