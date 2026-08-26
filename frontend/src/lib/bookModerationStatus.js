export const BOOK_MODERATION_MESSAGES = Object.freeze({
  checking: "📚 Our bookish gatekeepers are checking this book.",
  checkingDetail: "Add to Shelf will unlock automatically when the check finishes.",
  reviewRequired:
    "📚 Our bookish gatekeepers are taking a closer look at this one.",
  reviewRequiredDetail: "An admin needs to review it before it can be added to a shelf.",
  blocked:
    "The book gatekeepers have gatekept this one.",
  blockedDetail: "Think we've made a mistake?",
  technicalError:
    "⚠️ Our bookish gatekeepers couldn't finish checking this book.",
  technicalErrorDetail: "You can still view the book. Try the check again in a moment.",
  retryAction: "Retry check",
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
      detail: BOOK_MODERATION_MESSAGES.technicalErrorDetail,
      retryActionLabel: BOOK_MODERATION_MESSAGES.retryAction,
      reportActionLabel: "",
    };
  }

  if (status === "review_required") {
    return {
      kind: "review_required",
      message: BOOK_MODERATION_MESSAGES.reviewRequired,
      detail: BOOK_MODERATION_MESSAGES.reviewRequiredDetail,
      retryActionLabel: "",
      reportActionLabel: "",
    };
  }

  if (FINAL_BLOCKED_STATUSES.has(status)) {
    return {
      kind: "blocked",
      message: BOOK_MODERATION_MESSAGES.blocked,
      detail: BOOK_MODERATION_MESSAGES.blockedDetail,
      retryActionLabel: "",
      reportActionLabel: BOOK_MODERATION_MESSAGES.reportAction,
    };
  }

  return {
    kind: "checking",
    message: BOOK_MODERATION_MESSAGES.checking,
    detail: BOOK_MODERATION_MESSAGES.checkingDetail,
    retryActionLabel: "",
    reportActionLabel: "",
  };
}
