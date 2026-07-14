function RatingPicker({ value, onChange }) {
  return (
    <div className="star-rating-picker" role="group" aria-label="Choose rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const fill =
          Number(value) >= star
            ? "100%"
            : Number(value) >= star - 0.5
              ? "50%"
              : "0%";

        return (
          <span className="rating-star-control" key={star}>
            <span className="rating-star-base">★</span>
            <span className="rating-star-fill" style={{ width: fill }}>★</span>
            <button
              type="button"
              aria-label={`${star - 0.5} stars`}
              onClick={() => onChange(star - 0.5)}
            />
            <button
              type="button"
              aria-label={`${star} stars`}
              onClick={() => onChange(star)}
            />
          </span>
        );
      })}
      <strong>{Number(value).toFixed(1)}</strong>
    </div>
  );
}

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
                src={book.coverUrl || `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false`}
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
                <option value="public">Public - post to feed</option>
                <option value="private">Private - save to my profile only</option>
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
