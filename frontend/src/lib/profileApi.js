import { requireSupabase } from "./supabase";

export async function getUserProfile(userId) {
  if (!userId) return null;

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio, yearly_goal, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
