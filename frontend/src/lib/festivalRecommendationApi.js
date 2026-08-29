import { materializeBookRecord } from "./libraryApi";
import { requireSupabase } from "./supabase";
import {
  MAX_FESTIVAL_PHOTO_SIZE,
  FESTIVAL_PHOTO_TYPES,
  validateFestivalPhoto,
} from "./festivalRecommendationModel";

export const FESTIVAL_PHOTO_BUCKET = "festival-student-photos";
export { MAX_FESTIVAL_PHOTO_SIZE, FESTIVAL_PHOTO_TYPES, validateFestivalPhoto };

const recommendationSelect = `
  id, user_id, book_id, language, quote, reason, student_photo_path,
  status, created_at, updated_at,
  books (id, title, author, isbn, cover_url),
  profiles (id, username, full_name, avatar_url)
`;

function getExtension(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "jpeg" ? "jpg" : extension || "jpg";
}

function mapRecommendation(row, photoUrl = "") {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    language: row.language,
    quote: row.quote || "",
    reason: row.reason || "",
    studentPhotoPath: row.student_photo_path || "",
    studentPhotoUrl: photoUrl,
    status: row.status || "submitted",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    book: row.books ? {
      bookId: row.books.id,
      title: row.books.title,
      author: row.books.author,
      isbn: row.books.isbn || "",
      coverUrl: row.books.cover_url || "",
      source: "catalog",
    } : null,
    profile: row.profiles ? {
      id: row.profiles.id,
      username: row.profiles.username || "",
      fullName: row.profiles.full_name || "",
      avatarUrl: row.profiles.avatar_url || "",
    } : null,
  };
}

async function addSignedPhotoUrls(rows) {
  const supabase = requireSupabase();
  return Promise.all((rows || []).map(async (row) => {
    if (!row.student_photo_path) return mapRecommendation(row);
    const { data } = await supabase.storage
      .from(FESTIVAL_PHOTO_BUCKET)
      .createSignedUrl(row.student_photo_path, 3600);
    return mapRecommendation(row, data?.signedUrl || "");
  }));
}

export async function getMyFestivalRecommendation() {
  const supabase = requireSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) return null;

  const { data, error } = await supabase
    .from("festival_book_recommendations")
    .select(recommendationSelect)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? (await addSignedPhotoUrls([data]))[0] : null;
}

export async function uploadFestivalPhoto(userId, file) {
  validateFestivalPhoto(file);
  const supabase = requireSupabase();
  const path = `${userId}/${crypto.randomUUID()}.${getExtension(file)}`;
  const { error } = await supabase.storage.from(FESTIVAL_PHOTO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function saveFestivalRecommendation({ userId, book, language, quote, reason, photoFile, existingPhotoPath = "" }) {
  const supabase = requireSupabase();
  const savedBook = await materializeBookRecord(userId, book);
  let photoPath = existingPhotoPath;
  let uploadedPath = "";

  try {
    if (photoFile) {
      uploadedPath = await uploadFestivalPhoto(userId, photoFile);
      photoPath = uploadedPath;
    }
    const { data, error } = await supabase.rpc("upsert_festival_book_recommendation", {
      p_book_id: savedBook.id,
      p_language: language,
      p_quote: quote.trim(),
      p_reason: reason.trim(),
      p_student_photo_path: photoPath,
    });
    if (error) throw error;
    if (uploadedPath && existingPhotoPath && existingPhotoPath !== uploadedPath) {
      await supabase.storage.from(FESTIVAL_PHOTO_BUCKET).remove([existingPhotoPath]);
    }
    return mapRecommendation({ ...data, books: savedBook });
  } catch (error) {
    if (uploadedPath) {
      await supabase.storage.from(FESTIVAL_PHOTO_BUCKET).remove([uploadedPath]);
    }
    throw error;
  }
}

export async function getFestivalRecommendationsForAdmin() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("festival_book_recommendations")
    .select(recommendationSelect)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return addSignedPhotoUrls(data);
}

export async function reviewFestivalRecommendation(id, status) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("review_festival_book_recommendation", {
    p_recommendation_id: id,
    p_status: status,
  });
  if (error) throw error;
  return data;
}
