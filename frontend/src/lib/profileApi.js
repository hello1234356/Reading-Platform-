import { requireSupabase } from "./supabase";

export async function getUserProfile(userId) {
  if (!userId) return null;

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio, yearly_goal, created_at, updated_at, favorite_book_1,favorite_book_2, favorite_book_3, favorite_book_4")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
