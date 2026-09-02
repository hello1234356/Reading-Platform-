import { useState } from "react";
import { reportBlockedBookModeration } from "../lib/bookModerationReports.js";
import { getBookModerationPresentation } from "../lib/bookModerationStatus.js";
import { useTranslation } from "react-i18next";

function BookModerationStatus({ book, onRetry }) {
  const { t } = useTranslation();
  const [reportState, setReportState] = useState("idle");
  const [retryState, setRetryState] = useState("idle");
  const presentation = getBookModerationPresentation(book);

  if (!presentation) return null;

  async function reportDecision(event) {
    event.preventDefault();
    event.stopPropagation();
    if (reportState === "sending" || reportState === "sent") return;

    setReportState("sending");
    try {
      await reportBlockedBookModeration(book);
      setReportState("sent");
    } catch (error) {
      console.error("Could not report the blocked book decision:", error);
      setReportState("error");
    }
  }

  async function retryCheck(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!onRetry || retryState === "retrying") return;
    setRetryState("retrying");
    try {
      await onRetry(book);
      setRetryState("idle");
    } catch (error) {
      console.error("Could not retry book moderation:", error);
      setRetryState("error");
    }
  }

  return (
    <div
      className={`book-moderation-state ${presentation.kind}`}
      role={presentation.kind === "technical_error" ? "alert" : "status"}
    >
      {presentation.kind === "checking" ? (
        <span className="book-moderation-spinner" aria-hidden="true" />
      ) : null}
      <span className="book-moderation-copy">
        <strong>{presentation.message}</strong>
        <span>{presentation.detail}</span>
      </span>
      {presentation.retryActionLabel && onRetry ? (
        <button className="book-moderation-retry-action" type="button"
          disabled={retryState === "retrying"} onClick={retryCheck}>
          {retryState === "retrying" ? t("moderation.retrying") : presentation.retryActionLabel}
        </button>
      ) : null}
      {presentation.reportActionLabel && reportState !== "sent" ? (
        <>
          {" "}
          <button
            className="book-moderation-report-action"
            type="button"
            disabled={reportState === "sending"}
            onClick={reportDecision}
          >
            {reportState === "sending" ? t("moderation.messagingAdmins") : presentation.reportActionLabel}
          </button>
          <span aria-hidden="true">.</span>
        </>
      ) : null}
      {reportState === "sent" ? (
        <span className="book-moderation-report-confirmation"> {t("moderation.sentAdmins")}</span>
      ) : null}
      {reportState === "error" ? (
        <span className="book-moderation-report-error"> {t("moderation.sendFailed")}</span>
      ) : null}
      {retryState === "error" ? (
        <span className="book-moderation-report-error"> {t("moderation.retryFailed")}</span>
      ) : null}
    </div>
  );
}

export default BookModerationStatus;
