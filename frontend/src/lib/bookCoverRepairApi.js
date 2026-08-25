import { requireSupabase } from "./supabase";
import { canRepairStoredBookCover } from "./bookCoverRepairModel";

const inFlightRepairs = new Map();

export async function repairStoredBookCover(book) {
  const bookId = Number(book?.bookId || book?.id);
  const staleCoverUrl = String(book?.coverUrl || "").trim();
  if (!canRepairStoredBookCover(book)) return "";

  const repairKey = `${bookId}:${staleCoverUrl}`;
  if (inFlightRepairs.has(repairKey)) return inFlightRepairs.get(repairKey);

  const repair = (async () => {
    const supabase = requireSupabase();
    const { data, error } = await supabase.functions.invoke("repair-book-cover", {
      body: { bookId, staleCoverUrl },
    });
    if (error) throw error;
    return data?.repaired && data?.coverUrl ? String(data.coverUrl) : "";
  })();

  inFlightRepairs.set(repairKey, repair);
  try {
    return await repair;
  } finally {
    inFlightRepairs.delete(repairKey);
  }
}
