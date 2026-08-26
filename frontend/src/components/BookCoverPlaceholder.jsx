import "./BookCoverPlaceholder.css";

function BookCoverPlaceholder({ className = "", decorative = false }) {
  return (
    <div
      className={`book-cover-placeholder ${className}`.trim()}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "No cover yet"}
    >
      <span className="book-cover-placeholder-mark" aria-hidden="true" />
      <span className="book-cover-placeholder-label" aria-hidden="true">No cover yet</span>
    </div>
  );
}

export default BookCoverPlaceholder;
