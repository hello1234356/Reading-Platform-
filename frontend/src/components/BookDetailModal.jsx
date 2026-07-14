function BookDetailModal({ book, loading, error, onClose }) {
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
          aria-label="Close book details"
          onClick={onClose}
        >
          ×
        </button>

        <div className="book-detail-cover">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={`Cover of ${book.title}`} />
          ) : (
            <span>No cover available</span>
          )}
        </div>

        <section className="book-detail-copy">
          <p className="eyebrow">Open Library</p>
          <h2 id="book-detail-title">{book.title}</h2>
          <p className="book-detail-author">{book.author}</p>
          {book.isbn ? <small>ISBN {book.isbn}</small> : null}

          {loading ? (
            <p className="book-detail-loading">Loading official description...</p>
          ) : (
            <p className="book-detail-description">{book.description}</p>
          )}

          {error ? <p className="book-detail-error">{error}</p> : null}
        </section>
      </article>
    </div>
  );
}

export default BookDetailModal;
