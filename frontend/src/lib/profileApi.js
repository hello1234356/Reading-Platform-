import { requireSupabase } from "./supabase";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const allowedAvatarTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export async function getUserProfile(userId) {
  if (!userId) return null;

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, avatar_url, bio, yearly_goal, created_at, updated_at, favorite_book_1, favorite_book_2, favorite_book_3, favorite_book_4",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function getFileExtension(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "jpeg") {
    return "jpg";
  }

  return extension || "jpg";
}

export async function uploadUserAvatar(userId, file) {
  if (!userId) {
    throw new Error("You must be logged in to upload an avatar.");
  }

  if (!file) {
    throw new Error("Please choose an image.");
  }

  if (!allowedAvatarTypes.includes(file.type)) {
    throw new Error("Please choose a JPG, PNG, or WebP image.");
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("Your avatar must be smaller than 5 MB.");
  }

  const supabase = requireSupabase();
  const extension = getFileExtension(file);
  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(filePath);

  const avatarUrl = publicUrlData?.publicUrl;

  if (!avatarUrl) {
    throw new Error("The avatar uploaded, but its URL could not be created.");
  }

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .update({
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select(
      "id, username, full_name, avatar_url, bio, yearly_goal, created_at, updated_at, favorite_book_1, favorite_book_2, favorite_book_3, favorite_book_4",
    )
    .single();

  if (profileError) {
    throw profileError;
  }

  return updatedProfile;
}