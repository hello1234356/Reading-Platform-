function ModerationBlockedCard({
  level = "block",
  message,
  onEdit,
}) {
  const isReported = level === "report";

  return (
    <div
      className={
        isReported
          ? "moderation-blocked-card severe"
          : "moderation-blocked-card"
      }
      role="alert"
      aria-live="assertive"
    >
      <div className="moderation-blocked-copy">
        <span
          className="moderation-blocked-icon"
          aria-hidden="true"
        >
          {isReported ? "!" : "×"}
        </span>

        <div>
          <strong>
            {isReported
              ? "Serious community violation"
              : "This cannot be posted"}
          </strong>

          <p>
            {message ||
              (isReported
                ? "This message severely violates our community guidelines. It has been blocked and submitted to school moderators for review."
                : "This message contains language that is not permitted on the school platform. Please revise it before posting.")}
          </p>
        </div>
      </div>

      <div className="moderation-blocked-actions">
        <button
          className="moderation-edit-button"
          type="button"
          onClick={onEdit}
        >
          Edit message
        </button>
      </div>
    </div>
  );
}

export default ModerationBlockedCard;