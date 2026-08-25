import { useState } from "react";
import { getNextImageErrorState } from "../lib/imageRetryState";

function RetryingImage({ src, fallback = null, onError, onFinalError, ...imageProps }) {
  const [errorState, setErrorState] = useState({
    src: null,
    attempts: 0,
    failed: false,
  });
  const currentErrorState = errorState.src === src
    ? errorState
    : { src, attempts: 0, failed: false };

  if (!src || currentErrorState.failed) {
    return fallback;
  }

  function handleError(event) {
    // Hide the failed element immediately so the browser's broken-image icon
    // cannot remain visible while React mounts the retry or fallback.
    event.currentTarget.style.display = "none";
    onError?.(event);
    const nextErrorState = getNextImageErrorState(src, currentErrorState.attempts);
    if (nextErrorState.finalFailure) onFinalError?.();
    setErrorState(nextErrorState);
  }

  return (
    <img
      {...imageProps}
      key={currentErrorState.attempts}
      src={src}
      onError={handleError}
    />
  );
}

export default RetryingImage;
