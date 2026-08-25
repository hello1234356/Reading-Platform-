import { useState } from "react";
import { reportBlockedBookModeration } from "../lib/bookModerationReports.js";
import { getBookModerationPresentation } from "../lib/bookModerationStatus.js";

function BookModerationStatus({ book }) {
  const [reportState, setReportState] = useState("idle");
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

  return (
    <div
      className={`book-moderation-state ${presentation.kind}`}
      role={presentation.kind === "technical_error" ? "alert" : "status"}
    >
      <span>{presentation.message}</span>
      {presentation.reportActionLabel && reportState !== "sent" ? (
        <>
          {" "}
          <button
            className="book-moderation-report-action"
            type="button"
            disabled={reportState === "sending"}
            onClick={reportDecision}
          >
            {reportState === "sending" ? "Messaging the admin team…" : presentation.reportActionLabel}
          </button>
          <span aria-hidden="true">.</span>
        </>
      ) : null}
      {reportState === "sent" ? (
        <span className="book-moderation-report-confirmation"> Message sent to the admin team.</span>
      ) : null}
      {reportState === "error" ? (
        <span className="book-moderation-report-error"> Couldn&apos;t send that message. Try again.</span>
      ) : null}
    </div>
  );
}

export default BookModerationStatus;
