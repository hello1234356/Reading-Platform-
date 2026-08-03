import { requireSupabase } from "./supabase";

export async function getGradeLeaderboard() {
  const supabase = requireSupabase();

  const { data, error } = await supabase.rpc(
    "get_grade_leaderboard",
  );

  if (error) {
    throw error;
  }

  const rankings = (data || []).map((row) => ({
    grade: Number(row.grade),
    booksRead: Number(row.books_read) || 0,
  }));

  const rankingsByGrade = new Map(
    rankings.map((ranking) => [ranking.grade, ranking]),
  );

  return [9, 10, 11, 12]
    .map((grade) => rankingsByGrade.get(grade) || { grade, booksRead: 0 })
    .sort((a, b) => b.booksRead - a.booksRead || a.grade - b.grade);
}
export async function getTeacherLeaderboard() {
  const supabase = requireSupabase();

  const { data, error } = await supabase.rpc(
    "get_teacher_leaderboard",
  );

  if (error) {
    throw error;
  }

  return Number(data?.[0]?.books_read) || 0;
}
