import { requireSupabase } from "./supabase";
import {
  getAdminHomepagePreviewBanners,
  mapHomepageBanner,
  toHomepageBannerRow,
} from "./homepageBannerModel";

export { mapHomepageBanner, toHomepageBannerRow } from "./homepageBannerModel";

export const HOMEPAGE_BANNER_BUCKET = "homepage-banners";
export const MAX_HOMEPAGE_BANNER_SIZE = 10 * 1024 * 1024;
export const HOMEPAGE_BANNER_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const bannerColumns = "id, eyebrow, headline, body, image_url, image_path, image_position_x, image_position_y, image_zoom, text_alignment, text_vertical_position, font_family, text_size, text_color, custom_text_color, overlay_strength, cta_label, cta_url, sort_order, status, starts_at, ends_at, created_at, updated_at";

export async function getActiveHomepageBanners() {
  const supabase = requireSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("homepage_banners")
    .select(bannerColumns)
    .eq("status", "published")
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapHomepageBanner);
}

export async function getAllHomepageBanners() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("homepage_banners")
    .select(bannerColumns)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(mapHomepageBanner);
}

export async function getHomepageBannersForAdminPreview() {
  return getAdminHomepagePreviewBanners(await getAllHomepageBanners());
}

export async function saveHomepageBanner(banner) {
  const supabase = requireSupabase();
  const row = toHomepageBannerRow(banner);

  if (banner.id) {
    const { data, error } = await supabase
      .from("homepage_banners")
      .update(row)
      .eq("id", banner.id)
      .select(bannerColumns)
      .single();
    if (error) throw error;
    return mapHomepageBanner(data);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const { data, error } = await supabase
    .from("homepage_banners")
    .insert({ ...row, created_by: authData.user?.id })
    .select(bannerColumns)
    .single();
  if (error) throw error;
  return mapHomepageBanner(data);
}

export function validateHomepageBannerImage(file) {
  if (!file) throw new Error("Choose a background image.");
  if (!HOMEPAGE_BANNER_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_HOMEPAGE_BANNER_SIZE) {
    throw new Error("Banner images must be smaller than 10 MB.");
  }
}

export async function uploadHomepageBannerImage(file) {
  validateHomepageBannerImage(file);
  const supabase = requireSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("You must be logged in to upload a banner.");

  const extension = file.name.split(".").pop()?.toLowerCase() === "jpeg"
    ? "jpg"
    : file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${authData.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(HOMEPAGE_BANNER_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(HOMEPAGE_BANNER_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    await supabase.storage.from(HOMEPAGE_BANNER_BUCKET).remove([path]);
    throw new Error("The image uploaded, but its URL could not be created.");
  }
  return { imageUrl: data.publicUrl, imagePath: path };
}

export async function removeHomepageBannerImage(path) {
  if (!path) return;
  const supabase = requireSupabase();
  const { error } = await supabase.storage.from(HOMEPAGE_BANNER_BUCKET).remove([path]);
  if (error) throw error;
}

export async function deleteHomepageBanner(banner) {
  const supabase = requireSupabase();
  const { error } = await supabase.from("homepage_banners").delete().eq("id", banner.id);
  if (error) throw error;
  if (banner.imagePath) {
    try {
      await removeHomepageBannerImage(banner.imagePath);
    } catch (cleanupError) {
      console.warn("The deleted banner's image could not be removed:", cleanupError);
    }
  }
}

export async function reorderHomepageBanners(banners) {
  await Promise.all(banners.map((banner, index) => saveHomepageBanner({
    ...banner,
    sortOrder: index,
  })));
}
