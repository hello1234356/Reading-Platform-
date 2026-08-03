function ModerationWarningCard({
  message,
  onEdit,
  onConfirm,
  confirming = false,
  contentLabel = "message",
}) {
  return (
    <div
      className="moderation-warning-card"
      role="alert"
      aria-live="polite"
    >
      <div className="moderation-warning-copy">
        <span
          className="moderation-warning-icon"
          aria-hidden="true"
        >
          !
        </span>

        <div>
          <strong>Pause before posting</strong>

          <p>
            {message ||
              `This ${contentLabel} may come across as disrespectful. Consider revising it before posting.`}
          </p>
        </div>
      </div>

      <div className="moderation-warning-actions">
        <button
          className="moderation-edit-button"
          type="button"
          onClick={onEdit}
          disabled={confirming}
        >
          Keep editing
        </button>

        <button
          className="moderation-confirm-button"
          type="button"
          onClick={onConfirm}
          disabled={confirming}
        >
          {confirming ? "Posting..." : "Post anyway"}
        </button>
      </div>
    </div>
  );
}

export default ModerationWarningCard;