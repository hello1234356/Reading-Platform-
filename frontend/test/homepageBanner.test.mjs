import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getAdminHomepagePreviewBanners,
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
  mobile_image_url: "https://example.test/banner-mobile.webp",
  mobile_image_path: "admin/banner-mobile.webp",
  mobile_image_position_x: 28,
  mobile_image_position_y: 72,
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
  assert.equal(banner.mobileImageUrl, "https://example.test/banner-mobile.webp");
  assert.equal(banner.mobileImagePositionX, 28);
  assert.equal(banner.mobileImagePositionY, 72);
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
  assert.equal(row.mobile_image_url, "https://example.test/banner-mobile.webp");
  assert.equal(row.mobile_image_path, "admin/banner-mobile.webp");
  assert.equal(row.mobile_image_position_x, 28);
  assert.equal(row.mobile_image_position_y, 72);
});

test("mobile banner imagery and focal points remain optional", () => {
  const banner = mapHomepageBanner({
    ...storedBanner,
    mobile_image_url: null,
    mobile_image_path: null,
    mobile_image_position_x: null,
    mobile_image_position_y: null,
  });
  assert.equal(banner.mobileImageUrl, "");
  assert.equal(banner.mobileImagePositionX, null);
  assert.equal(banner.mobileImagePositionY, null);
  const row = toHomepageBannerRow(banner);
  assert.equal(row.mobile_image_url, null);
  assert.equal(row.mobile_image_position_x, null);
  assert.equal(row.mobile_image_position_y, null);
});

test("spotlight uses stable landscape ratios and responsive mobile imagery", async () => {
  const [carousel, css, adminCss, api, migration] = await Promise.all([
    readFile(new URL("../src/components/HomepageSpotlightCarousel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HomepageSpotlightCarousel.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HomepageBannerAdmin.css", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/homepageBannerApi.js", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/migrations/202608250010_homepage_banner_mobile_images.sql", import.meta.url), "utf8"),
  ]);
  assert.match(css, /homepage-spotlight-carousel[\s\S]*aspect-ratio:\s*3 \/ 1/);
  assert.match(css, /max-width:\s*1024px[\s\S]*aspect-ratio:\s*2 \/ 1/);
  assert.match(css, /max-width:\s*640px[\s\S]*aspect-ratio:\s*4 \/ 3/);
  assert.doesNotMatch(adminCss, /homepage-banner-preview\.mobile[^}]*min-height:\s*500px/);
  assert.match(adminCss, /homepage-banner-preview\.mobile[\s\S]*aspect-ratio:\s*4 \/ 3/);
  assert.match(carousel, /source media="\(max-width: 640px\)" srcSet=\{banner\.mobileImageUrl\}/);
  assert.match(api, /mobile_image_url, mobile_image_path, mobile_image_position_x, mobile_image_position_y/);
  assert.match(migration, /mobile_image_url text/);
  assert.match(migration, /mobile_image_position_x numeric/);
});

test("banner photographs remain color-accurate during horizontal transitions", async () => {
  const [carousel, css] = await Promise.all([
    readFile(new URL("../src/components/HomepageSpotlightCarousel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HomepageSpotlightCarousel.css", import.meta.url), "utf8"),
  ]);
  const imageRule = css.match(/\.homepage-spotlight-image\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(imageRule, /opacity:\s*1/);
  assert.match(imageRule, /filter:\s*none/);
  assert.match(imageRule, /mix-blend-mode:\s*normal/);
  assert.doesNotMatch(css, /homepage-spotlight-overlay[^}]*var\(--(?:mocha|forest|butter|olive|paper)/);
  assert.doesNotMatch(css, /homepage-spotlight-overlay[^}]*rgb\((?:20 17 15|255 250 241)/);
  assert.match(css, /homepage-spotlight-overlay[\s\S]*rgb\(0 0 0 \/ var\(--spotlight-overlay/);
  assert.match(css, /homepage-spotlight-track[\s\S]*transition:\s*transform/);
  assert.match(carousel, /transform:\s*`translateX\(-\$\{/);
  assert.doesNotMatch(carousel, /opacity.*active/i);
  assert.match(carousel, /getPreviousCarouselIndex\(activeIndex, slides\.length\)/);
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

test("admin homepage preview includes drafts and only currently active published banners", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const banners = [
    { id: "draft", status: "draft", startsAt: "2027-01-01T00:00:00Z", endsAt: "" },
    { id: "active", status: "published", startsAt: "", endsAt: "" },
    { id: "scheduled", status: "published", startsAt: "2027-01-01T00:00:00Z", endsAt: "" },
    { id: "expired", status: "published", startsAt: "", endsAt: "2026-01-01T00:00:00Z" },
  ];

  assert.deepEqual(
    getAdminHomepagePreviewBanners(banners, now).map((banner) => banner.id),
    ["draft", "active"],
  );
});
