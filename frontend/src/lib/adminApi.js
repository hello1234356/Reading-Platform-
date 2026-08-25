import { getPublicDisplayName } from "./identity";
import { requireSupabase } from "./supabase";

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function fetchProfilesByIds(userIds) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];

  if (ids.length === 0) return new Map();

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", ids);

  if (error) throw error;

  return new Map((data || []).map((profile) => [String(profile.id), profile]));
}

function mapProfile(profile) {
  return {
    id: profile?.id || "",
    username: profile?.username || "",
    fullName: profile?.full_name || "",
    avatarUrl: profile?.avatar_url || "",
    displayName: getPublicDisplayName(profile),
  };
}

function mapSubmission(row, profilesById) {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    submitter: mapProfile(profilesById.get(String(row.submitted_by))),
    title: row.title || "",
    author: row.author || "",
    language: row.language || "",
    isbn: row.isbn || "",
    publisher: row.publisher || "",
    publicationYear: row.publication_year || null,
    description: row.description || "",
    coverUrl: row.cover_url || "",
    status: row.status || "pending",
    approvedBookId: row.approved_book_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapModerationReport(row, profilesById) {
  return {
    id: row.id,
    userId: row.user_id,
    user: mapProfile(profilesById.get(String(row.user_id))),
    contextType: row.context_type || "",
    originalText: row.original_text || "",
    action: row.action || "",
    severity: row.severity || "",
    categories: Array.isArray(row.categories) ? row.categories : [],
    target: row.target || "",
    aiReason: row.ai_reason || "",
    aiFeedback: row.ai_feedback || "",
    confidence: Number.isFinite(Number(row.confidence))
      ? Number(row.confidence)
      : null,
    status: row.status || "pending",
    reviewedByEmail: row.reviewed_by_email || "",
    reviewedAt: row.reviewed_at || null,
    reviewerNote: row.reviewer_note || "",
    createdAt: row.created_at,
  };
}

function mapBookAssessment(row) {
  const evidence = row.evidence && typeof row.evidence === "object" ? row.evidence : {};
  return {
    id: row.id,
    bookId: row.book_id || null,
    source: row.source || "",
    externalId: row.external_id || "",
    status: row.status || "review_required",
    confidence: Number(row.confidence) || 0,
    identityConfidence: Number(row.identity_confidence) || 0,
    moderationConfidence: Number(row.moderation_confidence ?? row.confidence) || 0,
    knowledgeSource: row.knowledge_source || "provider_evidence",
    evidenceQuality: row.evidence_quality || "insufficient",
    riskScores: row.risk_scores && typeof row.risk_scores === "object" ? row.risk_scores : {},
    flags: Array.isArray(row.flags) ? row.flags : [],
    summary: row.summary || "",
    synopsis: row.synopsis || "",
    themes: Array.isArray(row.themes) ? row.themes : [],
    reasonForReview: row.reason_for_review || "",
    evidence,
    title: evidence.title || row.books?.title || "Untitled",
    author: Array.isArray(evidence.authors) && evidence.authors.length
      ? evidence.authors.join(", ") : row.books?.author || "Unknown author",
    coverUrl: evidence.coverUrl || row.books?.cover_url || "",
    policyVersion: row.policy_version || "",
    modelVersion: row.model_version || "",
    manuallyReviewed: Boolean(row.manually_reviewed),
    reviewedAt: row.reviewed_at || null,
    updatedAt: row.updated_at,
  };
}

function mapClub(row) {
  const members = Array.isArray(row.club_members) ? row.club_members : [];

  return {
    id: row.id,
    title: row.title || "",
    description: row.description || "",
    duration: row.duration || "",
    membersWanted: row.members_wanted || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    memberCount: members.length,
    lastActivityAt: row.last_activity_at || row.updated_at || row.created_at,
    archivedAt: row.archived_at || null,
    archivedReason: row.archived_reason || "",
    createdAt: row.created_at,
    host: mapProfile(row.creator_profile),
    bookTitle: row.books?.title || "",
    bookAuthor: row.books?.author || "",
    genre: row.books?.genre || "",
  };
}

export async function getAdminRole() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_admin_role");

  if (error) throw error;

  return data || null;
}

export async function listAdmins() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("admins")
    .select("email, role, added_by_email, created_at")
    .order("role", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((admin) => ({
    email: admin.email,
    role: admin.role,
    addedByEmail: admin.added_by_email || "",
    createdAt: admin.created_at,
  }));
}

export async function addAdmin(email) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("add_admin", {
    p_email: cleanEmail(email),
  });

  if (error) throw error;
  return data;
}

export async function removeAdmin(email) {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("remove_admin", {
    p_email: cleanEmail(email),
  });

  if (error) throw error;
}

export async function deleteBookSubmission(submissionId) {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("delete_book_submission", {
    p_submission_id: submissionId,
  });

  if (error) throw error;
}

export async function deleteModerationReport(reportId) {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("delete_moderation_report", {
    p_report_id: reportId,
  });

  if (error) throw error;
}

export async function getBookSubmissions(status = "pending") {
  const supabase = requireSupabase();
  let query = supabase
    .from("book_submissions")
    .select(`
      id,
      submitted_by,
      title,
      author,
      language,
      isbn,
      publisher,
      publication_year,
      description,
      cover_url,
      status,
      approved_book_id,
      created_at,
      updated_at
    `)
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const profilesById = await fetchProfilesByIds(
    (data || []).map((row) => row.submitted_by),
  );

  return (data || []).map((row) => mapSubmission(row, profilesById));
}

export async function moderateBookSubmission({ submissionId, decision }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("moderate_book_submission", {
    p_submission_id: submissionId,
    p_decision: decision,
    p_comment: null,
  });

  if (error) throw error;
  return data;
}

export async function getModerationReports(status = "pending") {
  const supabase = requireSupabase();
  let query = supabase
    .from("moderation_reports")
    .select(`
      id,
      user_id,
      context_type,
      original_text,
      action,
      severity,
      categories,
      target,
      ai_reason,
      ai_feedback,
      confidence,
      status,
      reviewed_by_email,
      reviewed_at,
      reviewer_note,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const profilesById = await fetchProfilesByIds(
    (data || []).map((row) => row.user_id),
  );

  return (data || []).map((row) => mapModerationReport(row, profilesById));
}

export async function reviewModerationReport({ reportId, status, reviewerNote = "" }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("review_moderation_report", {
    p_report_id: reportId,
    p_status: status,
    p_reviewer_note: reviewerNote,
  });

  if (error) throw error;
  return data;
}

export async function getBookModerationAssessments(status = "review_required") {
  const supabase = requireSupabase();
  let query = supabase
    .from("book_moderation_assessments")
    .select(`
      id, book_id, source, external_id, status, confidence, identity_confidence,
      moderation_confidence, knowledge_source, evidence_quality, risk_scores, flags,
      summary, synopsis, themes, reason_for_review, evidence, policy_version, model_version,
      manually_reviewed, reviewed_at, updated_at,
      books (title, author, cover_url)
    `)
    .order("updated_at", { ascending: false })
    .limit(500);
  const { data, error } = await query;
  if (error) throw error;
  const latestByIdentity = new Map();
  (data || []).forEach((row) => {
    const identity = `${row.source}\u0000${row.external_id}`;
    if (!latestByIdentity.has(identity)) latestByIdentity.set(identity, row);
  });
  return [...latestByIdentity.values()]
    .filter((row) => !status || status === "all" || row.status === status)
    .slice(0, 100)
    .map(mapBookAssessment);
}

export async function reviewBookModerationAssessment({ assessmentId, decision }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("review_book_moderation_assessment", {
    p_assessment_id: assessmentId,
    p_decision: decision,
  });
  if (error) throw error;
  return data;
}

export async function broadcastNotification({ broadcastId, title, body, targetUrl = "" }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("broadcast_notification", {
    p_broadcast_id: broadcastId,
    p_title: String(title || "").trim(),
    p_body: String(body || "").trim(),
    p_target_url: String(targetUrl || "").trim() || null,
  });
  if (error) throw error;
  return { broadcastId: data?.broadcast_id || broadcastId, sentCount: Number(data?.sent_count) || 0 };
}

export async function searchAdminClubs(searchTerm = "") {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("book_clubs")
    .select(`
      id,
      title,
      description,
      duration,
      members_wanted,
      tags,
      last_activity_at,
      archived_at,
      archived_reason,
      created_at,
      updated_at,
      books!book_clubs_book_id_fkey (
        id,
        title,
        author,
        genre
      ),
      creator_profile:profiles!book_clubs_creator_id_fkey (
        id,
        username,
        full_name,
        avatar_url
      ),
      club_members (
        user_id
      )
    `)
    .order("last_activity_at", { ascending: false });

  if (error) throw error;

  const cleanedQuery = String(searchTerm || "").trim().toLowerCase();
  const clubs = (data || []).map(mapClub);

  if (!cleanedQuery) return clubs.slice(0, 20);

  return clubs
    .filter((club) =>
      [
        club.title,
        club.description,
        club.bookTitle,
        club.bookAuthor,
        club.host.displayName,
        club.host.username,
        club.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(cleanedQuery),
    )
    .slice(0, 20);
}
