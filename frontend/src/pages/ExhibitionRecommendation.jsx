import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import BookCoverImage from "../components/BookCoverImage";
import { getExhibition } from "../config/exhibitions";
import { searchBooksByQueryLanguage } from "../lib/bookSearch";
import { submitExhibitionBookRecommendation } from "../lib/exhibitionRecommendationApi";
import pumpkinArt from "../assets/seasonal/halloween-pumpkin.png";
import moonCatArt from "../assets/seasonal/halloween-moon-cat.png";
import ghostArt from "../assets/seasonal/halloween-ghosts.png";

const MAX_REASON_LENGTH = 1200;

export default function ExhibitionRecommendation() {
  const { exhibitionSlug } = useParams();
  const exhibition = getExhibition(exhibitionSlug);
  const [form, setForm] = useState({
    submitterName: "",
    submitterGrade: "",
    bookTitle: "",
    recommendation: "",
  });
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [bookResults, setBookResults] = useState([]);
  const [bookSearchState, setBookSearchState] = useState("idle");
  const [selectedBook, setSelectedBook] = useState(null);
  const confirmationRef = useRef(null);
  const searchRequest = useRef(0);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (name === "bookTitle") {
      setSelectedBook(null);
    }
  }

  useEffect(() => {
    const query = form.bookTitle.trim();
    if (query.length < 3 || selectedBook) {
      setBookResults([]);
      setBookSearchState("idle");
      return undefined;
    }

    const requestId = ++searchRequest.current;
    setBookSearchState("loading");

    const timeout = window.setTimeout(async () => {
      try {
        const data = await searchBooksByQueryLanguage(query, 5);
        if (requestId === searchRequest.current) {
          setBookResults(data.results || []);
          setBookSearchState("ready");
        }
      } catch (error) {
        console.error("Failed to search exhibition book title:", error);
        if (requestId === searchRequest.current) {
          setBookResults([]);
          setBookSearchState("error");
        }
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [form.bookTitle, selectedBook]);

  function selectBook(book) {
    setSelectedBook(book);
    setBookResults([]);
    setBookSearchState("idle");
    setForm((current) => ({ ...current, bookTitle: book.title || current.bookTitle }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      await submitExhibitionBookRecommendation({
        ...form,
        selectedBook,
        exhibitionSlug: exhibition.slug,
      });
      setForm({
        submitterName: "",
        submitterGrade: "",
        bookTitle: "",
        recommendation: "",
      });
      setSelectedBook(null);
      setBookResults([]);
      setStatus("submitted");
      window.setTimeout(() => confirmationRef.current?.focus(), 0);
    } catch (error) {
      console.error("Failed to submit exhibition recommendation:", error);
      setMessage(error.message || "Could not send this recommendation right now.");
      setStatus("idle");
    }
  }

  const isSubmitting = status === "submitting";

  return (
    <section
      className={`exhibition-page ${exhibition.themeClass}`}
      aria-label={exhibition.ariaLabel}
    >
      <header className="exhibition-hero">
        <div className="exhibition-hero-art" aria-hidden="true">
          <img className="exhibition-pumpkin-art" src={pumpkinArt} alt="" />
          <img className="exhibition-ghost-art" src={ghostArt} alt="" />
        </div>
        <span className="exhibition-web" aria-hidden="true" />
        <p className="eyebrow">{exhibition.eyebrow}</p>
        <h1>{exhibition.title}</h1>
        <p>{exhibition.intro}</p>
      </header>

      <div className="exhibition-layout">
        <form className="exhibition-form" onSubmit={handleSubmit}>
          <div className="exhibition-form-grid">
            <label>
              <span>Name <small>Optional</small></span>
              <input
                name="submitterName"
                value={form.submitterName}
                onChange={updateField}
                maxLength={80}
              />
            </label>

            <label>
              <span>Grade <small>Optional</small></span>
              <input
                name="submitterGrade"
                value={form.submitterGrade}
                onChange={updateField}
                maxLength={40}
              />
            </label>
          </div>

          <div className="exhibition-book-picker">
            <label>
              <span>Book Title</span>
              <input
                name="bookTitle"
                value={form.bookTitle}
                onChange={updateField}
                maxLength={240}
                required
                autoComplete="off"
              />
            </label>
            {selectedBook ? (
              <div className="exhibition-selected-book">
                <BookCoverImage src={selectedBook.coverUrl} alt={`Cover of ${selectedBook.title}`} />
                <span>
                  <strong>{selectedBook.title}</strong>
                  <small>{selectedBook.author || "Unknown author"}</small>
                </span>
                <button type="button" onClick={() => setSelectedBook(null)}>
                  Change
                </button>
              </div>
            ) : null}
            {!selectedBook && bookResults.length ? (
              <div className="exhibition-book-results" role="listbox" aria-label="Book matches">
                {bookResults.map((book) => (
                  <button
                    type="button"
                    key={`${book.source || "book"}-${book.bookId || book.externalId || book.title}`}
                    onClick={() => selectBook(book)}
                  >
                    <BookCoverImage src={book.coverUrl} alt="" />
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.author || "Unknown author"}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {bookSearchState === "loading" ? (
              <p className="exhibition-search-note">Searching shelves...</p>
            ) : null}
            {bookSearchState === "error" ? (
              <p className="exhibition-search-note">Book search is unavailable right now.</p>
            ) : null}
          </div>

          <label>
            <span>
              {exhibition.descriptionLabel}
              <small>{form.recommendation.length}/{MAX_REASON_LENGTH}</small>
            </span>
            <textarea
              name="recommendation"
              value={form.recommendation}
              onChange={updateField}
              maxLength={MAX_REASON_LENGTH}
              required
              rows={8}
              placeholder={exhibition.descriptionPlaceholder}
            />
          </label>

          {message ? <p className="exhibition-error" role="alert">{message}</p> : null}

          <div className="exhibition-form-footer">
          <img className="exhibition-moon-seal" src={moonCatArt} alt="" aria-hidden="true" />
          <button className="exhibition-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? exhibition.submittingLabel : exhibition.submitLabel}
          </button>
          <Link className="exhibition-events-link" to="/events">Back to Events</Link>
          </div>
        </form>
      </div>

      {status === "submitted" ? (
        <div className="exhibition-confirmation" tabIndex={-1} ref={confirmationRef}>
          <p>{exhibition.confirmation}</p>
        </div>
      ) : null}
    </section>
  );
}
