import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getFestivalRecommendationsForAdmin,
  reviewFestivalRecommendation,
} from "../lib/festivalRecommendationApi";
import BookCoverImage from "./BookCoverImage";
import ProfileLink from "./ProfileLink";

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(value));
}

function FestivalRecommendationAdmin() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      setItems(await getFestivalRecommendationsForAdmin());
      setStatus("ready");
    } catch (loadError) {
      setError(loadError.message || "Could not load festival recommendations.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // The async loader synchronizes this tab with the remote review queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function review(item, nextStatus) {
    setSavingId(item.id);
    setError("");
    try {
      await reviewFestivalRecommendation(item.id, nextStatus);
      setItems((current) => current.map((entry) =>
        entry.id === item.id ? { ...entry, status: nextStatus } : entry));
    } catch (reviewError) {
      setError(reviewError.message || "Could not update this recommendation.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="admin-panel festival-admin" aria-label="Festival recommendations">
      <div className="festival-admin-heading">
        <div><p className="eyebrow">Temporary campaign</p><h2>Gen Z Reading Festival</h2><p className="admin-muted">Review student recommendations and choose entries for festival boards.</p></div>
        <button className="ghost-button" type="button" onClick={load} disabled={status === "loading"}>Refresh</button>
      </div>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      {status === "loading" ? <p className="admin-empty">Loading festival recommendations…</p> : null}
      {status === "ready" && !items.length ? <p className="admin-empty">No festival recommendations yet.</p> : null}
      <div className="festival-admin-grid">
        {items.map((item) => (
          <article className="admin-card festival-admin-card" key={item.id}>
            <div className="festival-admin-student-photo">
              {item.studentPhotoUrl ? <img src={item.studentPhotoUrl} alt={`Festival submission by ${item.profile?.fullName || item.profile?.username || "student"}`} /> : <span>Photo unavailable</span>}
            </div>
            <div className="festival-admin-copy">
              <div className="festival-admin-meta">
                <span className={`admin-status ${item.status}`}>{item.status.replace("_", " ")}</span>
                <span>{item.language === "chinese" ? "Chinese" : "English"}</span>
                <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
              </div>
              <ProfileLink userId={item.profile?.id} className="admin-profile-line" ariaLabel="View student profile">
                <span><strong>{item.profile?.fullName || item.profile?.username || "Unknown student"}</strong>{item.profile?.username ? <small>@{item.profile.username}</small> : null}</span>
              </ProfileLink>
              <Link className="festival-admin-book" to={`/discover?bookId=${item.bookId}`}>
                <BookCoverImage src={item.book?.coverUrl} alt={`Cover of ${item.book?.title || "book"}`} />
                <span><strong>{item.book?.title || "Untitled"}</strong><small>{item.book?.author || "Unknown author"}</small></span>
              </Link>
              <blockquote><span>A quote they love</span><p>“{item.quote}”</p></blockquote>
              <div className="festival-admin-reason"><span>Why read it</span><p>{item.reason}</p></div>
              <div className="admin-actions">
                <button className="primary-button" type="button" disabled={savingId === item.id || item.status === "selected"} onClick={() => review(item, "selected")}>Selected</button>
                <button className="ghost-button" type="button" disabled={savingId === item.id || item.status === "not_selected"} onClick={() => review(item, "not_selected")}>Not selected</button>
                <button className="ghost-button" type="button" disabled={savingId === item.id || item.status === "submitted"} onClick={() => review(item, "submitted")}>Reset</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default FestivalRecommendationAdmin;
