function StarRating({ rating, size = 20 }) {
  const numericRating = Number(rating) || 0;

  return (
    <div className="star-rating" aria-label={`${numericRating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill =
          numericRating >= star
            ? "100%"
            : numericRating >= star - 0.5
              ? "50%"
              : "0%";

        return (
          <span
            className="rating-star-control display-star"
            key={star}
            style={{
              width: size,
              height: size,
              fontSize: size,
            }}
          >
            <span className="rating-star-base">★</span>
            <span
              className="rating-star-fill"
              style={{ width: fill }}
            >
              ★
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default StarRating;