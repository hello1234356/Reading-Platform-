import { useState } from "react";
import BookCoverPlaceholder from "./BookCoverPlaceholder";

function BookCoverImage({
  src,
  fallbackSrc = "",
  alt = "",
  className = "",
  decorative = alt === "",
  onError,
  ...imageProps
}) {
  const sourceKey = `${src || ""}\n${fallbackSrc || ""}`;
  const [imageState, setImageState] = useState({ sourceKey, src: src || "" });
  const currentState = imageState.sourceKey === sourceKey
    ? imageState
    : { sourceKey, src: src || "" };

  if (!currentState.src) {
    return <BookCoverPlaceholder className={className} decorative={decorative} />;
  }

  function handleError(event) {
    event.currentTarget.style.display = "none";
    onError?.(event);

    const nextSrc = currentState.src === src && fallbackSrc && fallbackSrc !== src
      ? fallbackSrc
      : "";
    setImageState({ sourceKey, src: nextSrc });
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
