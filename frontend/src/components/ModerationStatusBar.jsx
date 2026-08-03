function ModerationStatusBar({
  label = "Checking your message",
}) {
  return (
    <div
      className="moderation-status-bar"
      role="status"
      aria-live="polite"
    >
      <span
        className="moderation-status-spinner"
        aria-hidden="true"
      />

      <span>{label}</span>

      <span
        className="moderation-status-dots"
        aria-hidden="true"
      >
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

export default ModerationStatusBar;