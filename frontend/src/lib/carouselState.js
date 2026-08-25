export function wrapCarouselIndex(index, itemCount) {
  if (itemCount <= 0) return 0;
  return ((index % itemCount) + itemCount) % itemCount;
}

export function getNextCarouselIndex(index, itemCount) {
  return wrapCarouselIndex(index + 1, itemCount);
}

export function getPreviousCarouselIndex(index, itemCount) {
  return wrapCarouselIndex(index - 1, itemCount);
}

export function hasCarouselNavigation(itemCount) {
  return itemCount >= 2;
}

export function createHomepageSlides(banners) {
  return [
    { type: "quote", id: "default-quote" },
    ...banners.map((banner) => ({ ...banner, type: "banner" })),
  ];
}

export function getCarouselControlCounts(itemCount) {
  return hasCarouselNavigation(itemCount)
    ? { indicators: itemCount, arrows: 2 }
    : { indicators: 0, arrows: 0 };
}

export function getNextCarouselTransition(index, itemCount) {
  const currentIndex = getNextCarouselIndex(index, itemCount);
  return {
    currentIndex,
    trackIndex: index === itemCount - 1 ? itemCount + 1 : currentIndex + 1,
  };
}

export function getPreviousCarouselTransition(index, itemCount) {
  const currentIndex = getPreviousCarouselIndex(index, itemCount);
  return {
    currentIndex,
    trackIndex: index === 0 ? 0 : currentIndex + 1,
  };
}
