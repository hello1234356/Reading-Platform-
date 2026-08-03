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
    action = "report";
    feedback =
      "This message severely violates our community guidelines. It has been blocked and marked for moderator review.";
  } else if (legacyResult.hasFilteredLanguage) {
    action = "block";
    feedback =
      "This message contains language that is not permitted on the school platform. Please revise it before posting.";
  }

  return {
    action,
    contextType,
    originalText,
    approvedText: originalText,
    filteredText: originalText,
    matchedTerms: legacyResult.matchedTerms,
    severity:
      action === "report"
        ? "high"
        : action === "block"
          ? "medium"
          : "none",
    feedback,
    reason: "Keyword fallback moderation.",
    categories:
      action === "allow"
        ? ["none"]
        : ["profanity"],
    target: "unknown",
    confidence: 0,
    needsReview: action === "report",
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
        "moderation-content",
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

    return {
      action: data.action,
      contextType,
      originalText,
      approvedText: originalText,
      filteredText: originalText,
      matchedTerms: [],
      severity: data.severity || "none",
      feedback: data.feedback || "",
      reason: data.reason || "",
      categories: Array.isArray(data.categories)
        ? data.categories
        : [],
      target: data.target || "unknown",
      confidence: Number(data.confidence) || 0,
      needsReview: Boolean(data.needsReview),
      provider: data.provider || "deepseek",
    };
  } catch (error) {
    console.error(
        "AI moderation request failed:",
        error,
    );

    throw new ModerationError(
        "Your message could not be checked right now, so it was not published. Please try again.",
        "MODERATION_UNAVAILABLE",
        {
        action: "block",
        severity: "high",
        feedback:
            "Your message could not be checked right now, so it was not published. Please try again.",
        categories: [],
        target: "unknown",
        confidence: 0,
        needsReview: false,
        provider: "unavailable",
        contextType,
        originalText,
        },
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

  if (moderation.action === "report") {
    throw new ModerationError(
      moderation.feedback ||
        "This message severely violates our community guidelines. It has been blocked and marked for moderator review.",
      "MODERATION_REPORT",
      moderation,
    );
  }

  if (moderation.action === "block") {
    throw new ModerationError(
      moderation.feedback ||
        "This message contains inappropriate content and cannot be published.",
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
        "Please consider revising this message before publishing.",
      "MODERATION_WARNING",
      moderation,
    );
  }

  return moderation;
}