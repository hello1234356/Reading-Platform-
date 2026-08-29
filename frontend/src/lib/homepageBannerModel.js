export function mapHomepageBanner(row) {
  return {
    id: row.id,
    eyebrow: row.eyebrow || "",
    headline: row.headline || "",
    body: row.body || "",
    imageUrl: row.image_url || "",
    imagePath: row.image_path || "",
    imagePositionX: Number(row.image_position_x ?? 50),
    imagePositionY: Number(row.image_position_y ?? 50),
    imageZoom: Number(row.image_zoom ?? 1),
    mobileImageUrl: row.mobile_image_url || "",
    mobileImagePath: row.mobile_image_path || "",
    mobileImagePositionX: row.mobile_image_position_x == null
      ? null : Number(row.mobile_image_position_x),
    mobileImagePositionY: row.mobile_image_position_y == null
      ? null : Number(row.mobile_image_position_y),
    textAlignment: row.text_alignment || "left",
    textVerticalPosition: row.text_vertical_position || "center",
    fontFamily: row.font_family || "lit_serif",
    textSize: row.text_size || "large",
    textColor: row.text_color || "cream",
    customTextColor: row.custom_text_color || "#fffaf1",
    overlayStrength: row.overlay_strength || "medium",
    ctaLabel: row.cta_label || "",
    ctaUrl: row.cta_url || "",
    actionType: row.action_type || "none",
    actionTarget: row.action_target || "",
    sortOrder: Number(row.sort_order || 0),
    status: row.status || "draft",
    startsAt: row.starts_at || "",
    endsAt: row.ends_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toHomepageBannerRow(banner) {
  return {
    eyebrow: banner.eyebrow.trim() || null,
    headline: banner.headline.trim() || null,
    body: banner.body.trim() || null,
    image_url: banner.imageUrl,
    image_path: banner.imagePath || null,
    image_position_x: Number(banner.imagePositionX),
    image_position_y: Number(banner.imagePositionY),
    image_zoom: Number(banner.imageZoom ?? 1),
    mobile_image_url: banner.mobileImageUrl || null,
    mobile_image_path: banner.mobileImagePath || null,
    mobile_image_position_x: banner.mobileImagePositionX == null
      ? null : Number(banner.mobileImagePositionX),
    mobile_image_position_y: banner.mobileImagePositionY == null
      ? null : Number(banner.mobileImagePositionY),
    text_alignment: banner.textAlignment,
    text_vertical_position: banner.textVerticalPosition,
    font_family: banner.fontFamily,
    text_size: banner.textSize,
    text_color: banner.textColor,
    custom_text_color: banner.textColor === "custom" ? banner.customTextColor : null,
    overlay_strength: banner.overlayStrength,
    cta_label: banner.ctaLabel.trim() || null,
    cta_url: banner.ctaUrl.trim() || null,
    action_type: banner.actionType || "none",
    action_target: banner.actionType === "none" ? null : banner.actionTarget.trim(),
    sort_order: Number(banner.sortOrder || 0),
    status: banner.status,
    starts_at: banner.startsAt || null,
    ends_at: banner.endsAt || null,
  };
}

export function isHomepageBannerCurrentlyActive(banner, now = new Date()) {
  if (banner.status !== "published") return false;
  const timestamp = now.getTime();
  if (banner.startsAt && new Date(banner.startsAt).getTime() > timestamp) return false;
  if (banner.endsAt && new Date(banner.endsAt).getTime() <= timestamp) return false;
  return true;
}

export function getAdminHomepagePreviewBanners(banners, now = new Date()) {
  return banners.filter((banner) => (
    banner.status === "draft" || isHomepageBannerCurrentlyActive(banner, now)
  ));
}
