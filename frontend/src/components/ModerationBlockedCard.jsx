import { useTranslation } from "react-i18next";

function ModerationBlockedCard({
  level = "block",
  message,
  onEdit,
}) {
  const { t } = useTranslation();
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
              ? t("moderation.serious")
              : t("moderation.cannotPost")}
          </strong>

          <p>
            {message ||
              (isReported
                ? t("moderation.seriousDetail")
                : t("moderation.blockedDetail"))}
          </p>
        </div>
      </div>

      <div className="moderation-blocked-actions">
        <button
          className="moderation-edit-button"
          type="button"
          onClick={onEdit}
        >
          {t("moderation.editMessage")}
        </button>
      </div>
    </div>
  );
}

export default ModerationBlockedCard;
