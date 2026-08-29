import { useEffect, useRef, useState } from "react";
import { searchBooksByQueryLanguage } from "../lib/bookSearch";
import { applyBookModerationUpdate } from "../lib/bookModerationApi";
import {
  getMyFestivalRecommendation,
  saveFestivalRecommendation,
  validateFestivalPhoto,
} from "../lib/festivalRecommendationApi";
import BookCoverImage from "./BookCoverImage";

const emptyDraft = { language: "", quote: "", reason: "" };

function FestivalBookSubmissionModal({ userId, onClose }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedBook, setSelectedBook] = useState(null);
  const [existing, setExisting] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const searchRequest = useRef(0);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving]);

  useEffect(() => {
    let cancelled = false;
    getMyFestivalRecommendation()
      .then((submission) => {
        if (cancelled || !submission) return;
        setExisting(submission);
        setSelectedBook(submission.book);
        setPhotoPreview(submission.studentPhotoUrl);
        setDraft({
          language: submission.language,
          quote: submission.quote,
          reason: submission.reason,
        });
      })
      .catch(() => setError("Your existing submission could not be loaded. Please try again."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  async function search(event) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    const requestId = ++searchRequest.current;
    setSearchStatus("loading");
    setError("");
    try {
      const searchResult = await searchBooksByQueryLanguage(term, 8);
      if (requestId !== searchRequest.current) return;
      setResults(searchResult.results);
      setSearchStatus(searchResult.results.length ? "ready" : "empty");
      void searchResult.startModeration((key, status, details = {}) => {
        if (requestId !== searchRequest.current) return;
        setResults((current) => current.map((book) =>
          applyBookModerationUpdate(book, key, status, details)));
      });
    } catch {
      if (requestId !== searchRequest.current) return;
      setSearchStatus("error");
      setError("Book search is unavailable right now. Please try again.");
    }
  }

  function choosePhoto(event) {
    const file = event.target.files?.[0];
    try {
      validateFestivalPhoto(file);
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      setError("");
    } catch (photoError) {
      event.target.value = "";
      setError(photoError.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedBook || !draft.language || !draft.quote.trim() || !draft.reason.trim()
      || (!photoFile && !existing?.studentPhotoPath)) return;
    setSaving(true);
    setError("");
    try {
      await saveFestivalRecommendation({
        userId,
        book: selectedBook,
        language: draft.language,
        quote: draft.quote,
        reason: draft.reason,
        photoFile,
        existingPhotoPath: existing?.studentPhotoPath || "",
      });
      setComplete(true);
    } catch (submitError) {
      setError(submitError.message || "Your recommendation could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = Boolean(selectedBook && draft.language && draft.quote.trim()
    && draft.reason.trim() && (photoFile || existing?.studentPhotoPath) && !saving);

  return (
    <div className="festival-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="festival-modal" role="dialog" aria-modal="true" aria-labelledby="festival-modal-title">
        <button className="festival-modal-close" type="button" aria-label="Close" onClick={onClose} disabled={saving}>×</button>
        {complete ? (
          <div className="festival-success">
            <span aria-hidden="true">📚</span>
            <p className="eyebrow">Gen Z Reading Festival</p>
            <h2 id="festival-modal-title">You're in!</h2>
            <p>Your recommendation has been submitted for the Gen Z Reading Festival. Selected recommendations may appear on festival boards around school.</p>
            <button className="primary-button" type="button" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <header className="festival-modal-heading">
              <p className="eyebrow">Gen Z Reading Festival</p>
              <h2 id="festival-modal-title">Share a Book You Love 📖</h2>
              <p>Share a book recommendation for the Gen Z Reading Festival. Selected submissions may be featured on boards around school.</p>
              {existing ? <small>You already submitted—save below to update your recommendation.</small> : null}
            </header>
            {loading ? <p className="festival-status">Loading your submission…</p> : (
              <>
                <fieldset className="festival-fieldset">
                  <legend>Book</legend>
                  {selectedBook ? (
                    <div className="festival-selected-book">
                      <BookCoverImage src={selectedBook.coverUrl} alt={`Cover of ${selectedBook.title}`} />
                      <div><strong>{selectedBook.title}</strong><span>{selectedBook.author}</span></div>
                      <button type="button" className="ghost-button" onClick={() => setSelectedBook(null)}>Change</button>
                    </div>
                  ) : (
                    <>
                      <div className="festival-book-search">
                        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(event); }} placeholder="Search by title, author, or ISBN" aria-label="Search for a book" />
                        <button type="button" onClick={search} disabled={searchStatus === "loading"}>{searchStatus === "loading" ? "Searching…" : "Search"}</button>
                      </div>
                      {searchStatus === "empty" ? <p className="festival-status">No matching books found.</p> : null}
                      <div className="festival-search-results">
                        {results.map((book) => (
                          <button type="button" key={book.moderationKey} disabled={book.moderationStatus !== "approved"} onClick={() => { setSelectedBook(book); setResults([]); }}>
                            <BookCoverImage src={book.coverUrl} alt="" decorative />
                            <span><strong>{book.title}</strong><small>{book.author}</small></span>
                            <em>{book.moderationStatus === "approved" ? "Choose" : book.moderationStatus === "checking" ? "Checking…" : "Unavailable"}</em>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </fieldset>
                <fieldset className="festival-fieldset">
                  <legend>Recommendation</legend>
                  <label><span>A quote you love</span><textarea value={draft.quote} maxLength="300" rows="3" onChange={(event) => setDraft((current) => ({ ...current, quote: event.target.value }))} /><small>{draft.quote.length}/300</small></label>
                  <label><span>Why should someone read it?</span><textarea value={draft.reason} maxLength="300" rows="3" onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} /><small>{draft.reason.length}/300</small></label>
                </fieldset>
                <fieldset className="festival-fieldset festival-photo-language">
                  <legend>About this recommendation</legend>
                  <label className="festival-photo-field"><span>Student photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} />{photoPreview ? <img src={photoPreview} alt="Your submission preview" /> : null}<small>Required. JPG, PNG, or WebP up to 5 MB.</small></label>
                  <div className="festival-language-field"><span>Book language</span><div role="radiogroup" aria-label="Book language"><label><input type="radio" name="festival-language" value="english" checked={draft.language === "english"} onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value }))} />English</label><label><input type="radio" name="festival-language" value="chinese" checked={draft.language === "chinese"} onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value }))} />Chinese</label></div></div>
                </fieldset>
                {error ? <p className="festival-error" role="alert">{error}</p> : null}
                <div className="festival-modal-actions"><button className="ghost-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" type="submit" disabled={!canSubmit}>{saving ? "Submitting…" : existing ? "Update recommendation" : "Submit recommendation"}</button></div>
              </>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

export default FestivalBookSubmissionModal;
