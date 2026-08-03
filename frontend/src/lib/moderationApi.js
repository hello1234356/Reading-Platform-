import { requireSupabase } from "./supabase";
import { moderateText } from "./moderation";

export class ModerationError extends Error {
  constructor(message, code, moderation) {
    super(message);
    this.name = "ModerationError";
    this.code = code;
    this.moderation = moderation;
  }
}

function runKeywordFallback(text, contextType) {
  const originalText = String(text || "").trim();
  const legacyResult = moderateText(originalText);

  let action = "allow";
  let feedback = "";

  if (legacyResult.severity === "high") {
    action = "block";
    feedback =
      "This message contains language that cannot be published.";
  } else if (legacyResult.hasFilteredLanguage) {
    action = "warn";
    feedback =
      "This message may come across as disrespectful. Consider revising it before posting.";
  }

  return {
    action,
    contextType,
    originalText,
    approvedText: originalText,
    filteredText: legacyResult.filteredText,
    matchedTerms: legacyResult.matchedTerms,
    severity:
      action === "block"
        ? "high"
        : action === "warn"
          ? legacyResult.severity
          : "none",
    feedback,
    reason: "Keyword fallback moderation.",
    categories: [],
    confidence: 0,
    needsReview: action === "block",
    provider: "keyword-fallback",
  };
}

export async function moderateContent({
  text,
  contextType,
}) {
  const originalText = String(text || "").trim();

  if (!originalText) {
    throw new Error("Please write something first.");
  }

  const supabase = requireSupabase();

  try {
    const { data, error } =
      await supabase.functions.invoke(
        "moderate-content",
        {
          body: {
            text: originalText,
            contextType,
          },
        },
      );

    if (error) {
      throw error;
    }

    const validActions = [
      "allow",
      "warn",
      "block",
      "report",
    ];

    if (
      !data ||
      !validActions.includes(data.action)
    ) {
      throw new Error(
        "The moderation service returned an invalid decision.",
      );
    }

    const normalizedAction =
      data.action === "report"
        ? "block"
        : data.action;

    return {
      action: normalizedAction,
      contextType,
      originalText,
      approvedText: originalText,
      filteredText: originalText,
      matchedTerms: [],
      severity:
        data.action === "report"
          ? "high"
          : data.severity || "none",
      feedback: data.feedback || "",
      reason: data.reason || "",
      categories: Array.isArray(data.categories)
        ? data.categories
        : [],
      confidence: Number(data.confidence) || 0,
      needsReview:
        data.action === "report" ||
        data.action === "block" ||
        Boolean(data.needsReview),
      provider: "deepseek",
    };
  } catch (error) {
    console.error(
      "AI moderation failed; using keyword fallback:",
      error,
    );

    return runKeywordFallback(
      originalText,
      contextType,
    );
  }
}

export async function requireModeratedContent({
  text,
  contextType,
  allowWarningOverride = false,
}) {
  const moderation = await moderateContent({
    text,
    contextType,
  });

  if (moderation.action === "block") {
    throw new ModerationError(
      moderation.feedback ||
        "This message cannot be published.",
      "MODERATION_BLOCK",
      moderation,
    );
  }

  if (
    moderation.action === "warn" &&
    !allowWarningOverride
  ) {
    throw new ModerationError(
      moderation.feedback ||
        "Consider revising this message before publishing.",
      "MODERATION_WARNING",
      moderation,
    );
  }

  return moderation;
}