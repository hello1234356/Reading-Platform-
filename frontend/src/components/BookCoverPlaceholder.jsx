import "./BookCoverPlaceholder.css";
import { useTranslation } from "react-i18next";

function BookCoverPlaceholder({ className = "", decorative = false }) {
  const { t } = useTranslation();
  return (
    <div
      className={`book-cover-placeholder ${className}`.trim()}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : t("common.noCover")}
    >
      <span className="book-cover-placeholder-mark" aria-hidden="true" />
      <span className="book-cover-placeholder-label" aria-hidden="true">{t("common.noCover")}</span>
    </div>
  );
}

export default BookCoverPlaceholder;
