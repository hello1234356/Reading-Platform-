import { RatingPicker } from "./StarRating";
import { getGoogleBooksCoverUrl } from "../lib/googleBooks";

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
          aria-label="Close review popup"
        >
          ×
        </button>
        <p className="eyebrow">Finished Shelf</p>
        <h2>Rate & review?</h2>
        <form onSubmit={onSubmit}>
          <div className="modal-preview">
            {book.coverUrl || book.isbn ? (
              <img
                className="review-modal-cover"
                src={book.coverUrl || getGoogleBooksCoverUrl(book.isbn)}
                alt={`Cover of ${book.title}`}
              />
            ) : (
              <div className="tracked-cover" aria-hidden="true">
                <span>{book.title}</span>
              </div>
            )}
            <p>
              <strong>{book.title}</strong>
              <small>{book.author}</small>
            </p>
          </div>
          <label>
            <span>Rating</span>
            <RatingPicker
              value={draft.rating}
              onChange={(rating) => onChange({ ...draft, rating })}
            />
          </label>
          <label>
            <span>Review</span>
            <textarea
              rows="5"
              value={draft.review}
              onChange={(event) =>
                onChange({ ...draft, review: event.target.value })
              }
              placeholder="Write a review if you want to save one."
            />
          </label>
          {showVisibility ? (
            <label>
              <span>Visibility</span>
              <select
                value={draft.visibility}
                onChange={(event) =>
                  onChange({ ...draft, visibility: event.target.value })
                }
              >
                <option value="private">Private - Save To My Profile Only</option>
                <option value="public">Yes - Share To The Public Feed</option>
              </select>
            </label>
          ) : null}
          {error ? <p className="profile-save-error" role="alert">{error}</p> : null}
          <button className="primary-button full" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Review"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default ReviewModal;
