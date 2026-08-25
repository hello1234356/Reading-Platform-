export const BOOK_MODERATION_MESSAGES = Object.freeze({
  checking: "Checking with our bookish gatekeepers… 📚",
  reviewRequired:
    "Our bookish gatekeepers are taking a closer look at this one. Check back soon!",
  blocked:
    "The book gatekeepers have gatekept this one. Think we've made a mistake?",
  technicalError:
    "Our bookish gatekeepers are temporarily unavailable. Try again in a moment.",
  reportAction: "Message the admin team",
});

const FINAL_BLOCKED_STATUSES = new Set([
  "blocked",
  "rejected",
  "manual_rejected",
  "manually_rejected",
]);

const TECHNICAL_STATUSES = new Set([
  "error",
  "failed",
  "moderation_error",
  "classifier_unavailable",
  "edge_request_failed",
  "cache_request_failed",
  "persistence_error",
  "moderation_rate_limited",
  "moderation_quota_guard_unavailable",
  "moderation_response_incomplete",
]);

function isTechnicalFailure(status, failureCode) {
  if (TECHNICAL_STATUSES.has(status) || TECHNICAL_STATUSES.has(failureCode)) {
    return true;
  }

  return /(?:_error|_failed|_unavailable|_timeout|_truncated|_invalid_json)$/u
    .test(failureCode);
}

export function getBookModerationPresentation(value = {}) {
  const status = String(
    typeof value === "string" ? value : value.moderationStatus || value.status || "checking",
  ).trim().toLowerCase();
  const failureCode = String(
    typeof value === "object"
      ? value.moderationFailureCode || value.failureCode || ""
      : "",
  ).trim().toLowerCase();

  if (status === "approved") return null;

  // A technical failure must never inherit final-rejection language, even if
  // malformed upstream data happens to contain both values.
  if (isTechnicalFailure(status, failureCode)) {
    return {
      kind: "technical_error",
      message: BOOK_MODERATION_MESSAGES.technicalError,
      reportActionLabel: "",
    };
  }

  if (status === "review_required") {
    return {
      kind: "review_required",
      message: BOOK_MODERATION_MESSAGES.reviewRequired,
      reportActionLabel: "",
    };
  }

  if (FINAL_BLOCKED_STATUSES.has(status)) {
    return {
      kind: "blocked",
      message: BOOK_MODERATION_MESSAGES.blocked,
      reportActionLabel: BOOK_MODERATION_MESSAGES.reportAction,
    };
  }

  return {
    kind: "checking",
    message: BOOK_MODERATION_MESSAGES.checking,
    reportActionLabel: "",
  };
}
