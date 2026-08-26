import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProfileLink from "../components/ProfileLink";
import {
  addAdmin,
  deleteBookSubmission,
  deleteModerationReport,
  getAdminRole,
  getBookSubmissions,
  getBookModerationAssessments,
  getModerationReports,
  listAdmins,
  moderateBookSubmission,
  reviewBookModerationAssessment,
  removeAdmin,
  reviewModerationReport,
  getPublicAnnouncementsForAdmin,
  savePublicAnnouncement,
  searchAdminClubs,
  searchAnnouncementRecipients,
  sendTargetedAdminNotification,
} from "../lib/adminApi";
import { useAuth } from "../hooks/useAuth";
import HomepageBannerAdmin from "../components/HomepageBannerAdmin";
import { requireSupabase } from "../lib/supabase";

const moderationFilters = ["pending", "concerning", "dismissed", "resolved", "all"];
const submissionFilters = ["pending", "approved", "rejected"];
const bookAssessmentFilters = ["review_required", "approved", "blocked", "error", "all"];

function formatDate(value) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function contextLabel(contextType) {
  const labels = {
    club_message: "Circles Message",
    feed_comment: "Feed Comment",
    feed_post: "Feed Post",
    feed_review: "Feed Review",
  };

  return labels[contextType] || titleCase(contextType || "Unknown Context");
}

function formatConfidence(value) {
  if (value === null || Number.isNaN(value)) return "";

  return `${Math.round(value * 100)}% confidence`;
}

function getModerationErrorMessage(error) {
  if (String(error?.message || "").toLowerCase().includes("permission denied")) {
    return "The moderation queue is unavailable right now.";
  }

  return error?.message || "Could not load moderation reports.";
}

function AdminTabs({ activeTab, onChange, isOwner }) {
  const tabs = ["moderation", "books", "book-ai", "clubs", "banners", "announcements"];
  if (isOwner) tabs.push("admins");

  return (
    <div className="admin-tabs" role="tablist" aria-label="Admin sections">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          className={activeTab === tab ? "active" : ""}
          onClick={() => onChange(tab)}
        >
          {tab === "books"
            ? "Book Verification"
            : tab === "book-ai"
              ? "Book AI Review"
            : tab === "clubs"
              ? "Club Activity"
              : tab === "banners"
                ? "Homepage Banners"
              : titleCase(tab)}
        </button>
      ))}
    </div>
  );
}

function FilterTabs({ filters, activeFilter, onChange }) {
  return (
    <div className="admin-filter-tabs">
      {filters.map((filter) => (
        <button
          key={filter}
          type="button"
          className={activeFilter === filter ? "active" : ""}
          onClick={() => onChange(filter)}
        >
          {titleCase(filter)}
        </button>
      ))}
    </div>
  );
}

function ProfileLine({ profile, fallback = "Unknown reader" }) {
  const content = (
    <>
      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : null}
      <span>
        <strong>{profile?.displayName || fallback}</strong>
        {profile?.fullName && profile.fullName !== profile.displayName ? (
          <small>{profile.fullName}</small>
        ) : null}
      </span>
    </>
  );

  if (profile?.id) {
    return (
      <ProfileLink
        userId={profile.id}
        className="admin-profile-line"
        ariaLabel={`View ${profile.displayName || fallback}'s profile`}
      >
        {content}
      </ProfileLink>
    );
  }

  return (
    <div className="admin-profile-line">
      {content}
    </div>
  );
}

function subscribeToAdminTable(tableName, onChange) {
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`admin-${tableName}-changes`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: tableName,
      },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

function SubmissionCover({ submission }) {
  const [coverFailed, setCoverFailed] = useState(false);

  if (submission.coverUrl && !coverFailed) {
    return (
      <div className="admin-book-cover">
        <img
          src={submission.coverUrl}
          alt={`Cover of ${submission.title}`}
          loading="lazy"
          onError={() => setCoverFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="admin-book-cover empty" aria-label="Cover unavailable">
      <span>Cover unavailable</span>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function OwnerDeleteButton({ label, disabled, onClick }) {
  return (
    <button
      className="admin-trash-button"
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <TrashIcon />
    </button>
  );
}

function ModerationTab({ isOwner }) {
  const [filter, setFilter] = useState("pending");
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");

  async function loadReports(nextFilter = filter) {
    setStatus("loading");
    setMessage("");

    try {
      setReports(await getModerationReports(nextFilter));
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load moderation reports:", error);
      setMessage(getModerationErrorMessage(error));
      setStatus("error");
    }
  }

  useEffect(() => {
    // Follows the existing Admin async-load convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    return subscribeToAdminTable("moderation_reports", () => {
      loadReports(filter);
    });
  }, [filter]);

  async function updateReport(reportId, nextStatus) {
    setSavingId(reportId);
    setMessage("");

    try {
      await reviewModerationReport({ reportId, status: nextStatus });
      await loadReports(filter);
    } catch (error) {
      console.error("Failed to review moderation report:", error);
      setMessage(getModerationErrorMessage(error));
    } finally {
      setSavingId("");
    }
  }

  async function deleteReport(reportId) {
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this moderation report?",
    );

    if (!confirmed) return;

    setSavingId(reportId);
    setMessage("");

    try {
      await deleteModerationReport(reportId);
      await loadReports(filter);
    } catch (error) {
      console.error("Failed to delete moderation report:", error);
      setMessage(error.message || "Could not delete this moderation report.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="admin-panel" aria-label="Moderation reports">
      <FilterTabs filters={moderationFilters} activeFilter={filter} onChange={setFilter} />
      {message ? <p className="admin-error" role="alert">{message}</p> : null}
      {status === "loading" ? <p className="admin-empty">Loading reports...</p> : null}
      {status === "ready" && reports.length === 0 ? (
        <p className="admin-empty">No reports in this queue.</p>
      ) : null}
      <div className="admin-card-list">
        {reports.map((report) => (
          <article
            className={isOwner ? "admin-card admin-owner-delete-card" : "admin-card"}
            key={report.id}
          >
            <div className="admin-card-heading">
              <ProfileLine profile={report.user} />
              <span className={`admin-status ${report.status}`}>
                {titleCase(report.status)}
              </span>
            </div>
            <p className="admin-card-text">{report.originalText}</p>
            <div className="admin-meta-grid">
              <span>Context: {contextLabel(report.contextType)}</span>
              <span>Severity: {titleCase(report.severity)}</span>
              <span>Target: {titleCase(report.target)}</span>
              <span>Created: {formatDate(report.createdAt)}</span>
              {report.categories.length ? (
                <span>Categories: {report.categories.join(", ")}</span>
              ) : null}
              {report.confidence !== null ? (
                <span>{formatConfidence(report.confidence)}</span>
              ) : null}
            </div>
            {report.aiReason ? (
              <p className="admin-muted">AI reason: {report.aiReason}</p>
            ) : null}
            {report.aiFeedback ? (
              <p className="admin-muted">AI feedback: {report.aiFeedback}</p>
            ) : null}
            {report.reviewerNote ? (
              <p className="admin-muted">Reviewer note: {report.reviewerNote}</p>
            ) : null}
            <div className="admin-actions">
              {report.status === "pending" ? (
                <>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={savingId === report.id}
                    onClick={() => updateReport(report.id, "dismissed")}
                  >
                    Dismiss as False Positive
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={savingId === report.id}
                    onClick={() => updateReport(report.id, "concerning")}
                  >
                    Mark Concerning
                  </button>
                </>
              ) : null}
              {report.status === "dismissed" || (report.status === "resolved" && filter !== "all") ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={savingId === report.id}
                  onClick={() => updateReport(report.id, "concerning")}
                >
                  Mark Concerning
                </button>
              ) : null}
              {report.status === "concerning" ? (
                <>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={savingId === report.id}
                    onClick={() => updateReport(report.id, "dismissed")}
                  >
                    Dismiss as False Positive
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={savingId === report.id}
                    onClick={() => updateReport(report.id, "resolved")}
                  >
                    Mark Resolved
                  </button>
                </>
              ) : null}
            </div>
            {isOwner ? (
              <OwnerDeleteButton
                label="Delete moderation report"
                disabled={savingId === report.id}
                onClick={() => deleteReport(report.id)}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function BookVerificationTab({ isOwner }) {
  const [filter, setFilter] = useState("pending");
  const [submissions, setSubmissions] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");

  async function loadSubmissions(nextFilter = filter) {
    setStatus("loading");
    setMessage("");

    try {
      setSubmissions(await getBookSubmissions(nextFilter));
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load book submissions:", error);
      setMessage(error.message || "Could not load book submissions.");
      setStatus("error");
    }
  }

  useEffect(() => {
    // Follows the existing Admin async-load convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSubmissions(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    return subscribeToAdminTable("book_submissions", () => {
      loadSubmissions(filter);
    });
  }, [filter]);

  async function decideSubmission(submissionId, decision) {
    setSavingId(submissionId);
    setMessage("");

    try {
      await moderateBookSubmission({ submissionId, decision });
      await loadSubmissions(filter);
    } catch (error) {
      console.error("Failed to moderate book submission:", error);
      setMessage(error.message || "Could not update this submission.");
    } finally {
      setSavingId("");
    }
  }

  async function deleteSubmission(submissionId) {
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this book request?",
    );

    if (!confirmed) return;

    setSavingId(submissionId);
    setMessage("");

    try {
      await deleteBookSubmission(submissionId);
      await loadSubmissions(filter);
    } catch (error) {
      console.error("Failed to delete book submission:", error);
      setMessage(error.message || "Could not delete this book request.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="admin-panel" aria-label="Book verification">
      <FilterTabs filters={submissionFilters} activeFilter={filter} onChange={setFilter} />
      {message ? <p className="admin-error" role="alert">{message}</p> : null}
      {status === "loading" ? <p className="admin-empty">Loading submissions...</p> : null}
      {status === "ready" && submissions.length === 0 ? (
        <p className="admin-empty">No book submissions in this queue.</p>
      ) : null}
      <div className="admin-card-list">
        {submissions.map((submission) => (
          <article
            className={
              isOwner
                ? "admin-card admin-book-card admin-owner-delete-card"
                : "admin-card admin-book-card"
            }
            key={submission.id}
          >
            <SubmissionCover submission={submission} />
            <div className="admin-book-main">
              <div className="admin-book-info">
                <div className="admin-book-title-block">
                  <p className="eyebrow">{titleCase(submission.status)}</p>
                  <h2>{submission.title}</h2>
                  <p className="admin-book-author">by {submission.author}</p>
                </div>

                <div className="admin-meta-grid">
                  {submission.language ? <span>Language: {submission.language}</span> : null}
                  {submission.publicationYear ? (
                    <span>Publication year: {submission.publicationYear}</span>
                  ) : null}
                  {submission.isbn ? <span>ISBN: {submission.isbn}</span> : null}
                  {submission.publisher ? <span>Publisher: {submission.publisher}</span> : null}
                  <span>Submitted: {formatDate(submission.createdAt)}</span>
                  {submission.approvedBookId ? (
                    <span>Book ID: {submission.approvedBookId}</span>
                  ) : null}
                </div>

                {submission.description ? (
                  <p className="admin-card-text admin-book-description">
                    {submission.description}
                  </p>
                ) : null}

                {submission.status === "pending" ? (
                  <div className="admin-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={savingId === submission.id}
                      onClick={() => decideSubmission(submission.id, "approve")}
                    >
                      Approve Book
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={savingId === submission.id}
                      onClick={() => decideSubmission(submission.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
                {submission.status === "approved" ? (
                  <div className="admin-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={savingId === submission.id}
                      onClick={() => decideSubmission(submission.id, "reject")}
                    >
                      Change to Rejected
                    </button>
                  </div>
                ) : null}
                {submission.status === "rejected" ? (
                  <div className="admin-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={savingId === submission.id}
                      onClick={() => decideSubmission(submission.id, "approve")}
                    >
                      Approve Book
                    </button>
                  </div>
                ) : null}
              </div>

              <aside className="admin-book-submitter">
                <p className="eyebrow">Submitted by</p>
                <ProfileLine profile={submission.submitter} fallback="Unknown submitter" />
              </aside>
            </div>
            {isOwner ? (
              <OwnerDeleteButton
                label="Delete book request"
                disabled={savingId === submission.id}
                onClick={() => deleteSubmission(submission.id)}
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function BookAiModerationTab() {
  const [filter, setFilter] = useState("review_required");
  const [assessments, setAssessments] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");

  async function loadAssessments(nextFilter = filter) {
    setStatus("loading");
    setMessage("");
    try {
      setAssessments(await getBookModerationAssessments(nextFilter));
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load book AI assessments:", error);
      setMessage(error.message || "Could not load book AI assessments.");
      setStatus("error");
    }
  }

  useEffect(() => {
    // This page follows the existing Admin queue loading convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssessments(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function decide(assessmentId, decision) {
    setSavingId(assessmentId);
    setMessage("");
    try {
      await reviewBookModerationAssessment({ assessmentId, decision });
      await loadAssessments(filter);
    } catch (error) {
      console.error("Failed to review book AI assessment:", error);
      setMessage(error.message || "Could not save this review.");
    } finally { setSavingId(""); }
  }

  return (
    <section className="admin-panel" aria-label="Book AI moderation review">
      <p className="admin-muted">
        Enforcement mode: search cards remain visible, but only approved books can be opened or used.
      </p>
      <FilterTabs filters={bookAssessmentFilters} activeFilter={filter} onChange={setFilter} />
      {message ? <p className="admin-error" role="alert">{message}</p> : null}
      {status === "loading" ? <p className="admin-empty">Loading assessments...</p> : null}
      {status === "ready" && assessments.length === 0 ? (
        <p className="admin-empty">No book assessments in this queue.</p>
      ) : null}
      <div className="admin-card-list">
        {assessments.map((assessment) => (
          <article className="admin-card admin-book-card" key={assessment.id}>
            <SubmissionCover submission={assessment} />
            <div className="admin-book-info">
              <div className="admin-card-heading">
                <div className="admin-book-title-block">
                  <h2>{assessment.title}</h2>
                  <p className="admin-book-author">by {assessment.author}</p>
                </div>
                <span className={`admin-status ${assessment.status}`}>
                  {titleCase(assessment.status)}
                </span>
              </div>
              <div className="admin-meta-grid">
                <span>Source: {titleCase(assessment.source)}</span>
                <span>External ID: {assessment.externalId}</span>
                <span>Identity: {formatConfidence(assessment.identityConfidence)}</span>
                <span>Moderation: {formatConfidence(assessment.moderationConfidence)}</span>
                <span>Knowledge: {titleCase(assessment.knowledgeSource)}</span>
                <span>Evidence: {titleCase(assessment.evidenceQuality)}</span>
                {assessment.reviewCategory ? (
                  <span>Review category: {titleCase(assessment.reviewCategory)}</span>
                ) : null}
                <span>Policy: {assessment.policyVersion}</span>
                <span>Model: {assessment.modelVersion}</span>
                {assessment.manuallyReviewed ? (
                  <span>Human reviewed {assessment.reviewedAt
                    ? formatDate(assessment.reviewedAt) : ""}</span>
                ) : null}
                {assessment.reviewedBy ? <span>Reviewer ID: {assessment.reviewedBy}</span> : null}
                {assessment.userReportCount > 0 ? (
                  <span>{assessment.userReportCount} student decision report{
                    assessment.userReportCount === 1 ? "" : "s"
                  }</span>
                ) : null}
              </div>
              {assessment.status === "error" ? (
                <p className="admin-error">
                  Technical moderation failure{assessment.failureCode
                    ? ` (${assessment.failureCode})` : ""}. This is not a content-review decision.
                </p>
              ) : null}
              {assessment.summary ? <p className="admin-muted">AI summary: {assessment.summary}</p> : null}
              {assessment.synopsis ? <p className="admin-muted">Synopsis used: {assessment.synopsis}</p> : null}
              {assessment.themes.length ? (
                <p className="admin-muted">Themes: {assessment.themes.join(", ")}</p>
              ) : null}
              {assessment.reasonForReview ? (
                <p className="admin-muted">Reason for review: {assessment.reasonForReview}</p>
              ) : null}
              <div className="admin-risk-grid" aria-label="Risk scores">
                {Object.entries(assessment.riskScores).map(([dimension, score]) => (
                  <span key={dimension}>{titleCase(dimension)}: {score}/3</span>
                ))}
              </div>
              {assessment.flags.length ? (
                <p className="admin-muted">Flags: {assessment.flags.join(", ")}</p>
              ) : null}
              <details className="admin-evidence-details">
                <summary>Evidence used</summary>
                {assessment.evidence.description ? <p>{assessment.evidence.description}</p> : null}
                <dl>
                  {Object.entries(assessment.evidence)
                    .filter(([key, value]) => key !== "description" && value != null && value !== "" &&
                      (!Array.isArray(value) || value.length > 0))
                    .map(([key, value]) => (
                      <div key={key}><dt>{titleCase(key)}</dt><dd>{
                        typeof value === "object" ? JSON.stringify(value) : String(value)
                      }</dd></div>
                    ))}
                </dl>
              </details>
              <div className="admin-actions">
                <button className="primary-button" type="button"
                  disabled={savingId === assessment.id}
                  onClick={() => decide(assessment.id, "approve")}>
                  {assessment.status === "error" ? "Approve manually" : "Approve"}
                </button>
                {assessment.status !== "error" ? (
                  <button className="ghost-button" type="button"
                    disabled={savingId === assessment.id}
                    onClick={() => decide(assessment.id, "block")}>Block</button>
                ) : null}
                {assessment.manuallyReviewed ? (
                  <button className="ghost-button" type="button"
                    disabled={savingId === assessment.id}
                    onClick={() => decide(assessment.id, "review_required")}>Return to review</button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ClubActivityTab() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [clubs, setClubs] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadClubs() {
      setStatus("loading");
      setMessage("");

      try {
        const results = await searchAdminClubs(query);
        if (!cancelled) {
          setClubs(results);
          setStatus("ready");
        }
      } catch (error) {
        console.error("Failed to search clubs:", error);
        if (!cancelled) {
          setMessage(error.message || "Could not load clubs.");
          setStatus("error");
        }
      }
    }

    loadClubs();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <section className="admin-panel" aria-label="Club activity">
      <label className="admin-search-control">
        <span className="sr-only">Search clubs</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search clubs..."
        />
      </label>
      {message ? <p className="admin-error" role="alert">{message}</p> : null}
      {status === "loading" ? <p className="admin-empty">Loading clubs...</p> : null}
      {status === "ready" && clubs.length === 0 ? (
        <p className="admin-empty">No matching clubs.</p>
      ) : null}
      <div className="admin-card-grid">
        {clubs.map((club) => (
          <article
            className="admin-card admin-clickable-card"
            key={club.id}
            role="link"
            tabIndex={0}
            onClick={(event) => {
              if (event.target.closest("a, button")) return;
              navigate(`/clubs/${club.id}`);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              navigate(`/clubs/${club.id}`);
            }}
          >
            <div className="admin-card-heading">
              <div>
                <p className="eyebrow">{club.archivedAt ? "Archived" : "Active"}</p>
                <h2>
                  <Link className="admin-entity-link" to={`/clubs/${club.id}`}>
                    {club.title}
                  </Link>
                </h2>
              </div>
              <ProfileLine profile={club.host} fallback="Unknown host" />
            </div>
            <p className="admin-card-text">{club.description || "No description."}</p>
            <div className="admin-meta-grid">
              <span>Book: {club.bookTitle || "No book title"}</span>
              {club.bookAuthor ? <span>Author: {club.bookAuthor}</span> : null}
              {club.genre ? <span>Genre: {club.genre}</span> : null}
              <span>Duration: {club.duration || "Unspecified"}</span>
              <span>Members: {club.memberCount}{club.membersWanted ? ` / ${club.membersWanted}` : ""}</span>
              <span>Last activity: {formatDate(club.lastActivityAt)}</span>
              <span>Created: {formatDate(club.createdAt)}</span>
              {club.tags.length ? <span>Tags: {club.tags.join(", ")}</span> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminManagementTab() {
  const [admins, setAdmins] = useState([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const owners = useMemo(
    () => admins.filter((admin) => admin.role === "owner"),
    [admins],
  );
  const normalAdmins = useMemo(
    () => admins.filter((admin) => admin.role === "admin"),
    [admins],
  );

  async function loadAdmins() {
    setStatus("loading");
    setMessage("");

    try {
      setAdmins(await listAdmins());
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load admins:", error);
      setMessage(error.message || "Could not load admins.");
      setStatus("error");
    }
  }

  useEffect(() => {
    // Follows the existing Admin async-load convention.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAdmins();
  }, []);

  async function submitAdmin(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      await addAdmin(email);
      setEmail("");
      await loadAdmins();
    } catch (error) {
      setMessage(error.message || "Could not add admin.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAdmin(adminEmail) {
    setSaving(true);
    setMessage("");

    try {
      await removeAdmin(adminEmail);
      await loadAdmins();
    } catch (error) {
      setMessage(error.message || "Could not remove admin.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="Admin management">
      {message ? <p className="admin-error" role="alert">{message}</p> : null}
      {status === "loading" ? <p className="admin-empty">Loading admins...</p> : null}
      <div className="admin-card-list">
        {owners.map((owner) => (
          <article className="admin-card admin-row-card" key={owner.email}>
            <div>
              <p className="eyebrow">Owner</p>
              <strong>{owner.email}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="admin-card-list">
        {normalAdmins.map((admin) => (
          <article className="admin-card admin-row-card" key={admin.email}>
            <div>
              <p className="eyebrow">Admin</p>
              <strong>{admin.email}</strong>
            </div>
            <button
              className="ghost-button"
              type="button"
              disabled={saving}
              onClick={() => deleteAdmin(admin.email)}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
      <form className="admin-add-form" onSubmit={submitAdmin}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email address"
          required
        />
        <button className="primary-button" type="submit" disabled={saving}>
          Add Admin
        </button>
      </form>
    </section>
  );
}

function AnnouncementsTab() {
  const [mode, setMode] = useState("everyone");
  const [draft, setDraft] = useState({
    announcementId: null,
    title: "",
    body: "",
    targetUrl: "",
    startsAt: "",
    endsAt: "",
    isActive: true,
  });
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientResults, setRecipientResults] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toDatetimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  async function loadAnnouncements() {
    try {
      setAnnouncements(await getPublicAnnouncementsForAdmin());
    } catch (error) {
      console.error("Failed to load public announcements:", error);
      setMessage(error.message || "Could not load public announcements.");
    }
  }

  useEffect(() => {
    // Load the small Admin announcement history for editing/deactivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAnnouncements();
  }, []);

  async function findRecipient() {
    const query = recipientQuery.trim();
    if (!query) {
      setRecipientResults([]);
      return;
    }
    setSearching(true);
    setMessage("");
    try {
      setRecipientResults(await searchAnnouncementRecipients(query));
    } catch (error) {
      console.error("Failed to search announcement recipients:", error);
      setMessage(error.message || "Could not search users.");
    } finally {
      setSearching(false);
    }
  }

  function resetDraft(nextMode = mode) {
    setDraft({
      announcementId: null,
      title: "",
      body: "",
      targetUrl: "",
      startsAt: "",
      endsAt: "",
      isActive: true,
    });
    setMode(nextMode);
    setRecipientQuery("");
    setRecipientResults([]);
    setSelectedRecipient(null);
  }

  function editAnnouncement(announcement) {
    setMode("everyone");
    setDraft({
      announcementId: announcement.id,
      title: announcement.title,
      body: announcement.body,
      targetUrl: announcement.targetUrl,
      startsAt: toDatetimeLocal(announcement.startsAt),
      endsAt: toDatetimeLocal(announcement.endsAt),
      isActive: announcement.isActive,
    });
    setMessage("Editing public announcement.");
  }

  async function sendAnnouncement(event) {
    event.preventDefault();
    const target = draft.targetUrl.trim();
    if (target && (!target.startsWith("/") || target.startsWith("//"))) {
      setMessage("Destination must be an internal path such as /discover.");
      return;
    }

    if (mode === "specific" && !selectedRecipient?.id) {
      setMessage("Choose the specific user who should receive this message.");
      return;
    }

    let startsAt = null;
    let endsAt = null;
    if (mode === "everyone") {
      startsAt = draft.startsAt ? new Date(draft.startsAt).toISOString() : new Date().toISOString();
      endsAt = draft.endsAt ? new Date(draft.endsAt).toISOString() : null;
      if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
        setMessage("Visible until must be later than visible from.");
        return;
      }
    }

    const confirmation = mode === "everyone"
      ? `${draft.announcementId ? "Update" : "Publish"} this announcement for everyone?`
      : `Send this message only to @${selectedRecipient.username || selectedRecipient.fullName}?`;
    if (!window.confirm(confirmation)) return;
    setSaving(true);
    setMessage("");
    try {
      if (mode === "everyone") {
        await savePublicAnnouncement({
          announcementId: draft.announcementId,
          title: draft.title,
          body: draft.body,
          targetUrl: target,
          startsAt,
          endsAt,
          isActive: draft.isActive,
        });
        resetDraft("everyone");
        setMessage("Public announcement saved as one global announcement.");
        await loadAnnouncements();
      } else {
        await sendTargetedAdminNotification({
          messageId: crypto.randomUUID(),
          recipientId: selectedRecipient.id,
          title: draft.title,
          body: draft.body,
          targetUrl: target,
        });
        const recipientLabel = selectedRecipient.username || selectedRecipient.fullName;
        resetDraft("specific");
        setMessage(`Message sent only to @${recipientLabel}.`);
      }
    } catch (error) {
      console.error("Failed to send announcement:", error);
      setMessage(error.message || "Could not send this announcement.");
    } finally { setSaving(false); }
  }

  return (
    <section className="admin-panel" aria-label="Notification announcements">
      <div className="admin-card admin-announcement-card">
        <div>
          <p className="eyebrow">Notification delivery</p>
          <h2>{mode === "everyone" ? "Public announcement" : "Targeted admin message"}</h2>
          <p className="admin-muted">Public announcements are stored once and remain visible to
            current and future users while active. Targeted messages go only to the selected user.</p>
        </div>
        <form className="admin-announcement-form" onSubmit={sendAnnouncement}>
          <fieldset className="admin-announcement-mode">
            <legend>Send to</legend>
            <label><input type="radio" name="announcement-audience" value="specific"
              checked={mode === "specific"} onChange={() => resetDraft("specific")} />
              Specific user</label>
            <label><input type="radio" name="announcement-audience" value="everyone"
              checked={mode === "everyone"} onChange={() => resetDraft("everyone")} />
              Everyone</label>
          </fieldset>
          {mode === "specific" ? (
            <div className="admin-recipient-picker">
              <label>
                <span>Find user by username or name</span>
                <span className="admin-recipient-search-row">
                  <input value={recipientQuery} maxLength="100"
                    onChange={(event) => setRecipientQuery(event.target.value)} />
                  <button className="ghost-button" type="button" disabled={searching}
                    onClick={findRecipient}>{searching ? "Searching..." : "Find user"}</button>
                </span>
              </label>
              {selectedRecipient ? (
                <p className="admin-muted">Recipient: <strong>@{
                  selectedRecipient.username || selectedRecipient.fullName
                }</strong></p>
              ) : null}
              {recipientResults.length ? (
                <div className="admin-recipient-results" aria-label="Matching users">
                  {recipientResults.map((recipient) => (
                    <button type="button" key={recipient.id}
                      className={selectedRecipient?.id === recipient.id ? "selected" : ""}
                      onClick={() => setSelectedRecipient(recipient)}>
                      <strong>@{recipient.username || "reader"}</strong>
                      <span>{recipient.fullName || "LitShelf reader"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <label>
            <span>Title</span>
            <input value={draft.title} maxLength="180" required
              onChange={(event) => updateDraft("title", event.target.value)} />
          </label>
          <label>
            <span>Message</span>
            <textarea value={draft.body} maxLength="1000" required rows="5"
              onChange={(event) => updateDraft("body", event.target.value)} />
          </label>
          <label>
            <span>Optional destination</span>
            <input value={draft.targetUrl} maxLength="500" placeholder="/discover"
              onChange={(event) => updateDraft("targetUrl", event.target.value)} />
          </label>
          {mode === "everyone" ? (
            <div className="admin-announcement-schedule">
              <label>
                <span>Visible from</span>
                <input type="datetime-local" value={draft.startsAt}
                  onChange={(event) => updateDraft("startsAt", event.target.value)} />
              </label>
              <label>
                <span>Visible until (optional)</span>
                <input type="datetime-local" value={draft.endsAt}
                  onChange={(event) => updateDraft("endsAt", event.target.value)} />
              </label>
              <label className="admin-announcement-active">
                <input type="checkbox" checked={draft.isActive}
                  onChange={(event) => updateDraft("isActive", event.target.checked)} />
                <span>Active</span>
              </label>
            </div>
          ) : null}
          <div className="admin-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving..." : mode === "everyone"
                ? draft.announcementId ? "Update public announcement" : "Publish for everyone"
                : "Send to specific user"}
            </button>
            {draft.announcementId ? (
              <button className="ghost-button" type="button"
                onClick={() => resetDraft("everyone")}>Cancel edit</button>
            ) : null}
          </div>
        </form>
        {message ? <p className="admin-muted" role="status">{message}</p> : null}
      </div>
      <div className="admin-announcement-history">
        <h2>Public announcements</h2>
        {announcements.length === 0 ? (
          <p className="admin-empty">No public announcements yet.</p>
        ) : announcements.map((announcement) => (
          <article className="admin-card" key={announcement.id}>
            <div className="admin-card-heading">
              <div><h3>{announcement.title}</h3><p className="admin-muted">{
                announcement.isActive ? "Active" : "Inactive"
              } · visible {formatDate(announcement.startsAt)}{
                announcement.endsAt ? ` until ${formatDate(announcement.endsAt)}` : " with no expiry"
              }</p></div>
              <button className="ghost-button" type="button"
                onClick={() => editAnnouncement(announcement)}>Edit</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Admin() {
  const { loading, isLoggedIn } = useAuth();
  const [role, setRole] = useState(null);
  const [roleStatus, setRoleStatus] = useState("loading");
  const [activeTab, setActiveTab] = useState("moderation");

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      if (loading) return;

      if (!isLoggedIn) {
        setRole(null);
        setRoleStatus("ready");
        return;
      }

      setRoleStatus("loading");

      try {
        const nextRole = await getAdminRole();
        if (!cancelled) {
          setRole(nextRole);
          setRoleStatus("ready");
        }
      } catch (error) {
        console.error("Failed to check admin role:", error);
        if (!cancelled) {
          setRole(null);
          setRoleStatus("error");
        }
      }
    }

    loadRole();

    return () => {
      cancelled = true;
    };
  }, [loading, isLoggedIn]);

  const isOwner = role === "owner";

  useEffect(() => {
    if (!isOwner && activeTab === "admins") {
      // Keep an owner-only tab from surviving a role refresh.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab("moderation");
    }
  }, [isOwner, activeTab]);

  if (loading || roleStatus === "loading") {
    return (
      <section className="home-page admin-page" aria-label="Admin">
        <p className="admin-empty">Checking admin access...</p>
      </section>
    );
  }

  if (!role) {
    return (
      <section className="home-page admin-page" aria-label="Admin">
        <div className="admin-denied">
          <p className="eyebrow">Admin</p>
          <h1>Access unavailable</h1>
          <p>This area is only available to LitShelf admins.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="home-page admin-page" aria-label="Admin">
      <header className="admin-hero">
        <p className="eyebrow">LitShelf</p>
        <h1>Admin</h1>
        <p className="school-motto">{isOwner ? "Owner access" : "Admin access"}</p>
      </header>

      <AdminTabs activeTab={activeTab} onChange={setActiveTab} isOwner={isOwner} />

      {activeTab === "moderation" ? <ModerationTab isOwner={isOwner} /> : null}
      {activeTab === "books" ? <BookVerificationTab isOwner={isOwner} /> : null}
      {activeTab === "book-ai" ? <BookAiModerationTab /> : null}
      {activeTab === "clubs" ? <ClubActivityTab /> : null}
      {activeTab === "banners" ? <HomepageBannerAdmin /> : null}
      {activeTab === "announcements" ? <AnnouncementsTab /> : null}
      {activeTab === "admins" && isOwner ? <AdminManagementTab /> : null}
    </section>
  );
}

export default Admin;
