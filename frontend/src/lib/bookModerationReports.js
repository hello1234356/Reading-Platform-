import { moderationIdentityForBook } from "./bookModerationApi.js";
import { requireSupabase } from "./supabase.js";

export async function reportBlockedBookModeration(book) {
  const identity = moderationIdentityForBook(book);
  const policyVersion = String(
    book?.moderationPolicyVersion || book?.policyVersion || "",
  ).trim();
  const decision = String(book?.moderationStatus || "").trim().toLowerCase();

  if (!identity.source || !identity.externalId || !policyVersion) {
    throw new Error("This book's moderation identity is incomplete.");
  }

  if (!["blocked", "rejected", "manual_rejected", "manually_rejected"].includes(decision)) {
    throw new Error("Only a final blocked decision can be reported.");
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_blocked_book_moderation", {
    p_source: identity.source,
    p_external_id: identity.externalId,
    p_policy_version: policyVersion,
    p_title: String(book?.title || "").trim(),
    p_author: String(book?.author || "").trim(),
  });

  if (error) throw error;
  return data;
}
