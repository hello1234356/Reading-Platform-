import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getActiveHomepageBanners,
  getHomepageBannersForAdminPreview,
} from "../lib/homepageBannerApi";
import { getAdminRole } from "../lib/adminApi";
import {
  createHomepageSlides,
  getNextCarouselIndex,
  getNextCarouselTransition,
  getPreviousCarouselTransition,
  hasCarouselNavigation,
  wrapCarouselIndex,
} from "../lib/carouselState";

const AUTOPLAY_DELAY = 7000;
const SWIPE_THRESHOLD = 48;

const textColors = {
  cream: "#fffaf1",
  white: "#ffffff",
  brown: "#4a382f",
  black: "#211d1a",
};

export function HomepageSpotlightSlide({ banner, active = true, loadImage = true }) {
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const color = banner.textColor === "custom"
    ? banner.customTextColor
    : textColors[banner.textColor] || textColors.cream;
  const hasCopy = banner.eyebrow || banner.headline || banner.body || banner.ctaLabel;

  return (
    <article
      className={`homepage-spotlight-slide align-${banner.textAlignment} vertical-${banner.textVerticalPosition} overlay-${banner.overlayStrength} font-${banner.fontFamily} size-${banner.textSize} text-${banner.textColor}`}
      aria-hidden={!active}
      style={{ "--spotlight-text-color": color }}
    >
      {loadImage && failedImageUrl !== banner.imageUrl && banner.imageUrl ? (
        <img
          className="homepage-spotlight-image"
          src={banner.imageUrl}
          alt=""
          loading={active ? "eager" : "lazy"}
          decoding="async"
          style={{
            objectPosition: `${banner.imagePositionX}% ${banner.imagePositionY}%`,
            transform: `scale(${banner.imageZoom ?? 1})`,
            transformOrigin: `${banner.imagePositionX}% ${banner.imagePositionY}%`,
          }}
          onError={() => setFailedImageUrl(banner.imageUrl)}
        />
      ) : null}
      <div className="homepage-spotlight-overlay" aria-hidden="true" />
      {hasCopy ? (
        <div className="homepage-spotlight-copy">
          {banner.eyebrow ? <p className="homepage-spotlight-eyebrow" style={{ color }}>{banner.eyebrow}</p> : null}
          {banner.headline ? <h1 style={{ color }}>{banner.headline}</h1> : null}
          {banner.body ? <p className="homepage-spotlight-body" style={{ color }}>{banner.body}</p> : null}
          {banner.ctaLabel && banner.ctaUrl ? (
            <SpotlightLink url={banner.ctaUrl} tabIndex={active ? 0 : -1}>
              {banner.ctaLabel}
            </SpotlightLink>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function SpotlightLink({ url, children, tabIndex }) {
  const navigate = useNavigate();
  const isInternal = url.startsWith("/") && !url.startsWith("//");

  if (!isInternal) {
    return (
      <a className="primary-button homepage-spotlight-cta" href={url} tabIndex={tabIndex}>
        <span className="homepage-spotlight-cta-label">{children}</span>
      </a>
    );
  }

  return (
    <button
      className="primary-button homepage-spotlight-cta"
      type="button"
      tabIndex={tabIndex}
      onClick={(event) => {
        event.stopPropagation();
        navigate(url);
      }}
    >
      <span className="homepage-spotlight-cta-label">{children}</span>
    </button>
  );
}

function QuoteSpotlightSlide({ dailyQuote, onAction, active = true }) {
  return (
    <article className="homepage-spotlight-slide homepage-quote-slide" aria-hidden={!active}>
      <div className="daily-quote-panel">
        <div className="daily-quote-meta">
          <span>{new Intl.DateTimeFormat(undefined, {
            month: "long",
            day: "numeric",
          }).format(new Date())}</span>
        </div>
        <blockquote>
          <span aria-hidden="true">“</span>
          <h1 id="home-title">{dailyQuote.quote}</h1>
          <span aria-hidden="true">”</span>
        </blockquote>
        <div className="daily-quote-credit">
          <p>{dailyQuote.author}</p>
          <small>{dailyQuote.source}</small>
        </div>
        <div className="daily-quote-actions">
          <button className="primary-button hero-action" type="button" tabIndex={active ? 0 : -1} onClick={onAction}>
            Share Your Reading
          </button>
        </div>
      </div>
    </article>
  );
}

function HomepageSpotlightCarousel({ dailyQuote, onFallbackAction }) {
  const [banners, setBanners] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [trackIndex, setTrackIndex] = useState(1);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [autoplayResetKey, setAutoplayResetKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef(null);
  const slides = createHomepageSlides(banners);

  const goToSlide = useCallback((index, manual = true) => {
    const nextIndex = wrapCarouselIndex(index, slides.length);
    setTransitionEnabled(true);
    setActiveIndex(nextIndex);
    setTrackIndex(nextIndex + 1);
    if (manual) setAutoplayResetKey((key) => key + 1);
  }, [slides.length]);

  const goToNextSlide = useCallback((manual = true) => {
    const next = getNextCarouselTransition(activeIndex, slides.length);
    setTransitionEnabled(true);
    setActiveIndex(next.currentIndex);
    setTrackIndex(next.trackIndex);
    if (manual) setAutoplayResetKey((key) => key + 1);
  }, [activeIndex, slides.length]);

  const goToPreviousSlide = useCallback((manual = true) => {
    const previous = getPreviousCarouselTransition(activeIndex, slides.length);
    setTransitionEnabled(true);
    setActiveIndex(previous.currentIndex);
    setTrackIndex(previous.trackIndex);
    if (manual) setAutoplayResetKey((key) => key + 1);
  }, [activeIndex, slides.length]);

  useEffect(() => {
    let cancelled = false;
    getAdminRole()
      .catch(() => null)
      .then((adminRole) => (
        adminRole
          ? getHomepageBannersForAdminPreview()
          : getActiveHomepageBanners()
      ))
      .then((items) => {
        if (!cancelled) {
          setBanners(items);
        }
      })
      .catch((error) => {
        console.error("Failed to load homepage banners:", error);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!hasCarouselNavigation(slides.length) || hovered || focusWithin) return undefined;
    const timer = window.setTimeout(() => {
      goToNextSlide(false);
    }, AUTOPLAY_DELAY);
    return () => window.clearTimeout(timer);
  }, [autoplayResetKey, focusWithin, goToNextSlide, hovered, slides.length]);

  useEffect(() => {
    const currentSlides = createHomepageSlides(banners);
    if (!hasCarouselNavigation(currentSlides.length)) return;
    const next = currentSlides[getNextCarouselIndex(activeIndex, currentSlides.length)];
    if (next?.type === "banner" && next.imageUrl) {
      const image = new Image();
      image.src = next.imageUrl;
    }
  }, [activeIndex, banners]);

  function renderSlide(slide, index, cloneKey = "") {
    const active = !cloneKey && index === activeIndex;
    if (slide.type === "quote") {
      return <QuoteSpotlightSlide dailyQuote={dailyQuote} onAction={onFallbackAction} active={active} key={`${slide.id}${cloneKey}`} />;
    }
    return (
      <HomepageSpotlightSlide
        banner={slide}
        active={active}
        loadImage={cloneKey !== "" || index === activeIndex || index === getNextCarouselIndex(activeIndex, slides.length)}
        key={`${slide.id}${cloneKey}`}
      />
    );
  }

  const renderedSlides = hasCarouselNavigation(slides.length)
    ? [slides[slides.length - 1], ...slides, slides[0]]
    : slides;

  return (
    <section
      className={`reading-room-hero homepage-spotlight-carousel${reducedMotion ? " reduced-motion" : ""}`}
      aria-roledescription="carousel"
      aria-label="Homepage spotlights"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
      onTouchStart={(event) => {
        if (event.target.closest?.(".homepage-spotlight-cta")) {
          touchStart.current = null;
          return;
        }
        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        touchStart.current = null;
        if (!start || !touch) return;
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0) goToNextSlide();
          else goToPreviousSlide();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") goToNextSlide();
        if (event.key === "ArrowLeft") goToPreviousSlide();
      }}
    >
      <div
        className={`homepage-spotlight-track${transitionEnabled ? "" : " no-transition"}`}
        style={{ transform: `translateX(-${hasCarouselNavigation(slides.length) ? trackIndex * 100 : 0}%)` }}
        onTransitionEnd={(event) => {
          if (event.currentTarget !== event.target) return;
          if (trackIndex !== 0 && trackIndex !== slides.length + 1) return;
          setTransitionEnabled(false);
          setTrackIndex(trackIndex === 0 ? slides.length : 1);
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTransitionEnabled(true)));
        }}
      >
        {renderedSlides.map((slide, renderedIndex) => {
          const isLeadingClone = hasCarouselNavigation(slides.length) && renderedIndex === 0;
          const isTrailingClone = hasCarouselNavigation(slides.length) && renderedIndex === renderedSlides.length - 1;
          const logicalIndex = isLeadingClone
            ? slides.length - 1
            : isTrailingClone
              ? 0
              : hasCarouselNavigation(slides.length) ? renderedIndex - 1 : renderedIndex;
          return renderSlide(slide, logicalIndex, isLeadingClone ? "-leading-clone" : isTrailingClone ? "-trailing-clone" : "");
        })}
      </div>

      {hasCarouselNavigation(slides.length) ? (
        <>
          <button className="homepage-spotlight-arrow previous" type="button" aria-label="Previous banner" onClick={goToPreviousSlide}>‹</button>
          <button className="homepage-spotlight-arrow next" type="button" aria-label="Next banner" onClick={goToNextSlide}>›</button>
          <div className="homepage-spotlight-pagination" aria-label="Choose a homepage banner">
            {slides.map((slide, index) => (
              <button
                type="button"
                key={slide.id}
                className={index === activeIndex ? "active" : ""}
                aria-label={slide.type === "quote" ? "Go to quote" : `Go to banner ${index}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default HomepageSpotlightCarousel;
