export const MAX_FESTIVAL_PHOTO_SIZE = 5 * 1024 * 1024;
export const FESTIVAL_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateFestivalPhoto(file) {
  if (!file) throw new Error("Choose a photo for your festival submission.");
  if (!FESTIVAL_PHOTO_TYPES.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_FESTIVAL_PHOTO_SIZE) {
    throw new Error("Your photo must be smaller than 5 MB.");
  }
}
