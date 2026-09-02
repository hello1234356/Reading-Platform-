function RatingBookIcon({ fill = "0%", size = 20 }) {
  return (
    <span
      className="rating-star-control rating-book-control display-star"
      style={{
        width: size,
        height: size,
        "--rating-size": `${size}px`,
      }}
      aria-hidden="true"
    >
      <svg
        className="rating-book-svg rating-star-base"
        viewBox="0 0 32 32"
        focusable="false"
      >
        <path d="M16 8.6C12.9 5.9 8.7 5.2 4 6.7v17.6c4.7-1.5 8.9-.8 12 1.9 3.1-2.7 7.3-3.4 12-1.9V6.7c-4.7-1.5-8.9-.8-12 1.9Z" />
        <path d="M16 8.6v17.6" />
        <path d="M8 11.2c2.6-.4 4.7.1 6.2 1.3" />
        <path d="M8 15c2.6-.4 4.7.1 6.2 1.3" />
        <path d="M18 12.5c1.5-1.2 3.6-1.7 6.2-1.3" />
        <path d="M18 16.3c1.5-1.2 3.6-1.7 6.2-1.3" />
      </svg>
      <span className="rating-star-fill" style={{ width: fill }}>
        <svg
          className="rating-book-svg"
          viewBox="0 0 32 32"
          focusable="false"
        >
          <path d="M16 8.6C12.9 5.9 8.7 5.2 4 6.7v17.6c4.7-1.5 8.9-.8 12 1.9 3.1-2.7 7.3-3.4 12-1.9V6.7c-4.7-1.5-8.9-.8-12 1.9Z" />
          <path d="M16 8.6v17.6" />
          <path d="M8 11.2c2.6-.4 4.7.1 6.2 1.3" />
          <path d="M8 15c2.6-.4 4.7.1 6.2 1.3" />
          <path d="M18 12.5c1.5-1.2 3.6-1.7 6.2-1.3" />
          <path d="M18 16.3c1.5-1.2 3.6-1.7 6.2-1.3" />
        </svg>
      </span>
    </span>
  );
}

function getRatingFill(rating, index) {
  const numericRating = Number(rating) || 0;

  if (numericRating >= index) {
    return "100%";
  }

  if (numericRating >= index - 0.5) {
    return "50%";
  }

  return "0%";
}

export function RatingPicker({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="star-rating-picker" role="group" aria-label={t("rating.choose")}>
      {[1, 2, 3, 4, 5].map((book) => (
        <span className="rating-picker-control" key={book}>
          <RatingBookIcon fill={getRatingFill(value, book)} size={28} />
          <button
            type="button"
            aria-label={t("rating.half", { rating: book - 0.5 })}
            onClick={() => onChange(book - 0.5)}
          />
          <button
            type="button"
            aria-label={t("rating.full", { rating: book })}
            onClick={() => onChange(book)}
          />
        </span>
      ))}
      <strong>{Number(value).toFixed(1)}</strong>
    </div>
  );
}

function StarRating({ rating, size = 20 }) {
  const { t } = useTranslation();
  const numericRating = Number(rating) || 0;

  return (
    <div className="star-rating" aria-label={t("rating.outOf", { rating: numericRating })}>
      {[1, 2, 3, 4, 5].map((book) => (
        <RatingBookIcon fill={getRatingFill(numericRating, book)} key={book} size={size} />
      ))}
    </div>
  );
}

export default StarRating;
import { useTranslation } from "react-i18next";
