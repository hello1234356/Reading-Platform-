import { useTranslation } from "react-i18next";

function ModerationStatusBar({
  label,
}) {
  const { t } = useTranslation();
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

      <span>{label || t("moderation.checkingMessage")}</span>

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
