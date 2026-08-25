import test from "node:test";
import assert from "node:assert/strict";
import {
  mapHomepageBanner,
  toHomepageBannerRow,
} from "../src/lib/homepageBannerModel.js";
import {
  createHomepageSlides,
  getCarouselControlCounts,
  getNextCarouselIndex,
  getNextCarouselTransition,
  getPreviousCarouselIndex,
  getPreviousCarouselTransition,
  hasCarouselNavigation,
  wrapCarouselIndex,
} from "../src/lib/carouselState.js";

const storedBanner = {
  id: "banner-1",
  eyebrow: "READING",
  headline: "Find Your Next Story",
  body: "Discover something worth staying up for.",
  image_url: "https://example.test/banner.webp",
  image_path: "admin/banner.webp",
  image_position_x: 42,
  image_position_y: 61,
  image_zoom: 1.35,
  text_alignment: "right",
  text_vertical_position: "bottom",
  font_family: "classic_serif",
  text_size: "huge",
  text_color: "custom",
  custom_text_color: "#f5e5b8",
  overlay_strength: "strong",
  cta_label: "Explore Books",
  cta_url: "/discover",
  sort_order: 2,
  status: "published",
};

test("homepage banner normalization preserves custom color, zoom, crop, and typography", () => {
  const banner = mapHomepageBanner(storedBanner);
  assert.equal(banner.customTextColor, "#f5e5b8");
  assert.equal(banner.imageZoom, 1.35);
  assert.equal(banner.imagePositionX, 42);
  assert.equal(banner.imagePositionY, 61);
  assert.equal(banner.fontFamily, "classic_serif");
  assert.equal(banner.textSize, "huge");
  assert.equal(banner.textAlignment, "right");
});

test("existing banner rows default image zoom to one", () => {
  assert.equal(mapHomepageBanner({ ...storedBanner, image_zoom: null }).imageZoom, 1);
});

test("homepage banner serialization persists custom color and image zoom", () => {
  const row = toHomepageBannerRow(mapHomepageBanner(storedBanner));
  assert.equal(row.text_color, "custom");
  assert.equal(row.custom_text_color, "#f5e5b8");
  assert.equal(row.image_zoom, 1.35);
});

test("carousel navigation wraps and controls require multiple banners", () => {
  assert.deepEqual([
    getNextCarouselIndex(0, 3),
    getNextCarouselIndex(1, 3),
    getNextCarouselIndex(2, 3),
  ], [1, 2, 0]);
  assert.equal(getPreviousCarouselIndex(0, 3), 2);
  assert.equal(wrapCarouselIndex(1, 3), 1);
  assert.equal(hasCarouselNavigation(1), false);
  assert.equal(hasCarouselNavigation(3), true);
});

test("the permanent quote combines with one banner into two controlled slides", () => {
  const slides = createHomepageSlides([{ id: "choose-path", headline: "Choose your path" }]);
  assert.equal(slides.length, 2);
  assert.deepEqual(slides.map((slide) => slide.id), ["default-quote", "choose-path"]);
  assert.deepEqual(getCarouselControlCounts(slides.length), { indicators: 2, arrows: 2 });
  assert.deepEqual(getNextCarouselTransition(0, 2), { currentIndex: 1, trackIndex: 2 });
  assert.deepEqual(getNextCarouselTransition(1, 2), { currentIndex: 0, trackIndex: 3 });
  assert.deepEqual(getPreviousCarouselTransition(0, 2), { currentIndex: 1, trackIndex: 0 });
  assert.deepEqual(getPreviousCarouselTransition(1, 2), { currentIndex: 0, trackIndex: 1 });
});

test("the quote-only state has no carousel controls", () => {
  const slides = createHomepageSlides([]);
  assert.equal(slides.length, 1);
  assert.deepEqual(getCarouselControlCounts(slides.length), { indicators: 0, arrows: 0 });
});
