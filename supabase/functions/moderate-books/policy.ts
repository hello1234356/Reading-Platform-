import type { AssessmentStatus, Classification, EvidenceQuality } from "./schema.ts";

export const POLICY_VERSION = "school-display-v1-observe-2026-08-25";
export const MODERATION_MODE = "observe" as const;
export const AUTO_BLOCK_ENABLED = false;
export const MIN_APPROVAL_CONFIDENCE = 0.78;

export function applyPolicy(ai: Classification, evidence: EvidenceQuality): AssessmentStatus {
  if (evidence === "insufficient" || ai.confidence < MIN_APPROVAL_CONFIDENCE) return "review_required";
  if (ai.political_or_regulatory_sensitivity >= 2) return "review_required";
  const nonPoliticalRisks = [ai.sexual_content, ai.violence, ai.self_harm,
    ai.drugs_or_gambling, ai.hate_or_extremism, ai.age_suitability];
  if (nonPoliticalRisks.some((risk) => risk >= 3)) {
    return AUTO_BLOCK_ENABLED && ai.recommendation === "block" ? "blocked" : "review_required";
  }
  if (ai.recommendation === "block" || ai.recommendation === "review_required") return "review_required";
  if ((evidence === "high" || evidence === "medium") && ai.recommendation === "approve") return "approved";
  return "review_required";
}
