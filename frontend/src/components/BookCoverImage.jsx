import { useState } from "react";
import BookCoverPlaceholder from "./BookCoverPlaceholder";
import {
  getBookCoverSourceAfterError,
  normalizeBookCoverSource,
} from "../lib/bookCoverSource";

function BookCoverImage({
  src,
  alt = "",
  className = "",
  decorative = alt === "",
  onError,
  ...imageProps
}) {
  const sourceKey = normalizeBookCoverSource(src);
  const [imageState, setImageState] = useState({ sourceKey, src: sourceKey });
  const currentState = imageState.sourceKey === sourceKey
    ? imageState
    : { sourceKey, src: sourceKey };

  if (!currentState.src) {
    return <BookCoverPlaceholder className={className} decorative={decorative} />;
  }

  function handleError(event) {
    event.currentTarget.style.display = "none";
    onError?.(event);

    setImageState({ sourceKey, src: getBookCoverSourceAfterError() });
  }

  return (
    <img
      {...imageProps}
      key={currentState.src}
      className={className}
      src={currentState.src}
      alt={alt}
      onError={handleError}
    />
  );
}

export default BookCoverImage;
