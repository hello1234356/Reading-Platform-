import { useLayoutEffect, useRef } from "react";
import { findLargestFittingFontSize } from "../lib/fitText";

const MIN_FONT_SIZE = 34;
const MIN_WRAPPED_FONT_SIZE = 22;

export default function FittedProfileName({ children }) {
  const containerRef = useRef(null);
  const headingRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const heading = headingRef.current;
    if (!container || !heading) return undefined;

    let animationFrame = 0;
    let lastWidth = -1;
    const fit = () => {
      const availableWidth = Math.floor(container.getBoundingClientRect().width);
      if (availableWidth <= 0 || availableWidth === lastWidth) return;
      lastWidth = availableWidth;

      heading.classList.remove("profile-display-name--wrap");
      heading.style.removeProperty("font-size");
      const cssMaximum = Math.round(Number.parseFloat(getComputedStyle(heading).fontSize)) || 104;
      const result = findLargestFittingFontSize({
        minSize: MIN_FONT_SIZE,
        maxSize: cssMaximum,
        wrapMinSize: MIN_WRAPPED_FONT_SIZE,
        fits(fontSize, lineCount = 1) {
          heading.style.fontSize = `${fontSize}px`;
          return heading.scrollWidth <= availableWidth * lineCount + 0.5;
        },
      });
      heading.style.fontSize = `${result.fontSize}px`;
      heading.classList.toggle("profile-display-name--wrap", result.needsWrap);
    };

    const scheduleFit = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    fit();
    void document.fonts?.ready.then(() => {
      lastWidth = -1;
      scheduleFit();
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [children]);

  return (
    <div className="profile-display-name-fit" ref={containerRef}>
      <h1 className="profile-display-name" ref={headingRef}>{children}</h1>
    </div>
  );
}
