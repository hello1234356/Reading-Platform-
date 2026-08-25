import { useState } from "react";
import { repairStoredBookCover } from "../lib/bookCoverRepairApi";
import RetryingImage from "./RetryingImage";

function RecoveringBookCoverImage({ book, src, fallback = null, onRepaired, ...imageProps }) {
  const [repairState, setRepairState] = useState({ source: "", repaired: "" });
  const effectiveSrc = repairState.source === src && repairState.repaired
    ? repairState.repaired
    : src;

  async function repair() {
    try {
      const repaired = await repairStoredBookCover({
        ...book,
        coverUrl: book?.storedCoverUrl || src,
      });
      if (!repaired) return;
      setRepairState({ source: src, repaired });
      onRepaired?.(repaired);
    } catch (error) {
      console.warn("Book cover repair could not be completed:", error);
    }
  }

  return (
    <RetryingImage
      {...imageProps}
      src={effectiveSrc}
      fallback={fallback}
      onFinalError={repair}
    />
  );
}

export default RecoveringBookCoverImage;
