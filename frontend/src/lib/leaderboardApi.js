import { requireSupabase } from "./supabase";

export async function getGradeLeaderboard() {
  const supabase = requireSupabase();

  const { data, error } = await supabase.rpc(
    "get_grade_leaderboard",
  );

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    grade: Number(row.grade),
    booksRead: Number(row.books_read) || 0,
  }));
}
