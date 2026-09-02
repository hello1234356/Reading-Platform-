import { useTranslation } from "react-i18next";

function ModerationWarningCard({
  message,
  onEdit,
  onConfirm,
  confirming = false,
  contentLabel = "message",
}) {
  const { t } = useTranslation();
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
          <strong>{t("moderation.pause")}</strong>

          <p>
            {message ||
              t("moderation.warning", { content: contentLabel })}
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
          {t("moderation.keepEditing")}
        </button>

        <button
          className="moderation-confirm-button"
          type="button"
          onClick={onConfirm}
          disabled={confirming}
        >
          {confirming ? t("moderation.posting") : t("moderation.postAnyway")}
        </button>
      </div>
    </div>
  );
}

export default ModerationWarningCard;
