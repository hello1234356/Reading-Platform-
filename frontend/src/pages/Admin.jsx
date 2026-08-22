import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProfileLink from "../components/ProfileLink";
import {
  addAdmin,
  deleteBookSubmission,
  deleteModerationReport,
  getAdminRole,
  getBookSubmissions,
  getModerationReports,
  listAdmins,
  moderateBookSubmission,
  removeAdmin,
  reviewModerationReport,
  searchAdminClubs,
} from "../lib/adminApi";
import { useAuth } from "../hooks/useAuth";

const moderationFilters = ["pending", "concerning", "dismissed", "resolved", "all"];
const submissionFilters = ["pending", "approved", "rejected"];

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
  const tabs = ["moderation", "books", "clubs"];
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
            : tab === "clubs"
              ? "Club Activity"
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
    loadReports(filter);
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
    loadSubmissions(filter);
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
      {activeTab === "clubs" ? <ClubActivityTab /> : null}
      {activeTab === "admins" && isOwner ? <AdminManagementTab /> : null}
    </section>
  );
}

export default Admin;
