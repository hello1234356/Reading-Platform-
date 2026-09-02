import { RatingPicker } from "./StarRating";
import BookCoverImage from "./BookCoverImage";
import { useTranslation } from "react-i18next";

function ReviewModal({
  book,
  draft,
  saving = false,
  error = "",
  showVisibility = false,
  onChange,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation();
  if (!book) return null;

  return (
    <div
      className="composer-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <section className="composer-modal" role="dialog" aria-modal="true">
        <button
          className="modal-close"
          type="button"
          disabled={saving}
          onClick={onClose}
          aria-label={t("books.closeReview")}
        >
          ×
        </button>
        <p className="eyebrow">{t("books.finishedShelf")}</p>
        <h2>{t("books.rateReview")}</h2>
        <form onSubmit={onSubmit}>
          <div className="modal-preview">
            <BookCoverImage
              className="review-modal-cover"
              src={book.coverUrl}
              alt={t("books.coverAlt", { title: book.title })}
              decorative
            />
            <p>
              <strong>{book.title}</strong>
              <small>{book.author}</small>
            </p>
          </div>
          <label>
            <span>{t("home.rating")}</span>
            <RatingPicker
              value={draft.rating}
              onChange={(rating) => onChange({ ...draft, rating })}
            />
          </label>
          <label>
            <span>{t("home.review")}</span>
            <textarea
              rows="5"
              value={draft.review}
              onChange={(event) =>
                onChange({ ...draft, review: event.target.value })
              }
              placeholder={t("books.reviewPlaceholder")}
            />
          </label>
          {showVisibility ? (
            <label>
              <span>{t("books.visibility")}</span>
              <select
                value={draft.visibility}
                onChange={(event) =>
                  onChange({ ...draft, visibility: event.target.value })
                }
              >
                <option value="private">{t("books.privateReview")}</option>
                <option value="public">{t("books.publicReview")}</option>
              </select>
            </label>
          ) : null}
          {error ? <p className="profile-save-error" role="alert">{error}</p> : null}
          <button className="primary-button full" type="submit" disabled={saving}>
            {saving ? t("profile.saving") : t("books.saveReview")}
          </button>
        </form>
      </section>
    </div>
  );
}

export default ReviewModal;
