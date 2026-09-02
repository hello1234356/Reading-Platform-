import RecoveringBookCoverImage from "./RecoveringBookCoverImage";
import BookCoverPlaceholder from "./BookCoverPlaceholder";
import { getBookSourceLabel } from "../lib/bookSource.js";
import { useTranslation } from "react-i18next";

function BookDetailModal({
  book,
  loading,
  error,
  onClose,
  footer,
}) {
  const { t } = useTranslation();
    if (!book) return null;

  return (
    <div
      className="composer-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <article
        className="book-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-detail-title"
      >
        <button
          className="modal-close"
          type="button"
          aria-label={t("books.closeDetails")}
          onClick={onClose}
        >
          ×
        </button>

        <div className="book-detail-cover">
          <RecoveringBookCoverImage
            book={book}
            src={book.coverUrl}
            alt={t("books.coverAlt", { title: book.title })}
            loading="lazy"
            fallback={<BookCoverPlaceholder decorative />}
          />
        </div>

        <section className="book-detail-copy">
          <p className="eyebrow">
            {getBookSourceLabel(book)}
          </p>
          <h2 id="book-detail-title">{book.title}</h2>
          <p className="book-detail-author">{book.author}</p>
          {book.isbn ? <small>ISBN {book.isbn}</small> : null}

          {loading ? (
            <p className="book-detail-loading">{t("books.loadingDescription")}</p>
          ) : (
            <p className="book-detail-description">{book.description}</p>
          )}

          {error ? <p className="book-detail-error">{error}</p> : null}
          {footer ? (
            <div className="book-detail-footer">
              {footer}
            </div>
          ) : null}
        </section>
      </article>
    </div>
  );
}

export default BookDetailModal;
