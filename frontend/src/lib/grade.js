// lib/grade.js

export function getGradeFromSchoolEmail(email) {
  if (!email) return null;

  const match = email.match(/_(\d{2})@/);

  if (!match) return null;

  const graduationYear = 2000 + Number(match[1]);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // Jan = 0

  const grade =
    currentMonth < 6
      ? 12 - (graduationYear - currentYear)
      : 13 - (graduationYear - currentYear);

  // Graduated or not yet in high school
  if (grade < 9 || grade > 12) {
    return null;
  }

  return grade;
}