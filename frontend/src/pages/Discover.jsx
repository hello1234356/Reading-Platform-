import { useEffect, useMemo, useState } from "react";
import editorialImage from "../assets/reading-room-editorial.png";
import { bookDatabasePreview, editorPicks } from "../data/books";
import { useRequireLogin } from "../hooks/useRequireLogin";

const DISCOVERY_STORAGE_KEY = "litshelf-discovery-state-v1";

function getInitialDiscoveryState() {
  const fallback = {
    query: "",
    progress: 38,
    trackedBook: bookDatabasePreview[0],
  };

  try {
    const savedState = JSON.parse(localStorage.getItem(DISCOVERY_STORAGE_KEY));

    if (!savedState) {
      return fallback;
    }

    return {
      ...fallback,
      ...savedState,
      trackedBook: savedState.trackedBook || fallback.trackedBook,
    };
  } catch {
    return fallback;
  }
}

function Discover() {
  const { requireLogin } = useRequireLogin();
  const [initialDiscoveryState] = useState(getInitialDiscoveryState);
  const [query, setQuery] = useState(initialDiscoveryState.query);
  const [progress, setProgress] = useState(initialDiscoveryState.progress);
  const [trackedBook, setTrackedBook] = useState(initialDiscoveryState.trackedBook);

  const filteredSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return bookDatabasePreview;
    }

    return bookDatabasePreview.filter((book) =>
      [book.title, book.author, book.isbn, book.shelf]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);

  useEffect(() => {
    localStorage.setItem(
      DISCOVERY_STORAGE_KEY,
      JSON.stringify({
        query,
        progress,
        trackedBook,
      }),
    );
  }, [query, progress, trackedBook]);

  return (
    <section className="home-page discover-page" aria-label="Discover books">
      <header className="discover-hero">
        <p className="eyebrow">Discovery</p>
        <h1>Find the book that follows you out of class.</h1>
        <p>
          Browse seasonal shelves, editor notes, and recommendations that feel
          passed across a library table.
        </p>
      </header>

      <div className="discover-tools" aria-label="Book tracking and search">
        <section className="tracked-panel" aria-label="Currently tracked book">
          <p className="eyebrow">Tracking now</p>
          <div className="tracked-book-card">
            <div className="tracked-cover" aria-hidden="true">
              <span>{trackedBook.title}</span>
            </div>
            <div>
              <strong>{trackedBook.title}</strong>
              <small>{trackedBook.author}</small>
              <p>{trackedBook.shelf}</p>
            </div>
          </div>
          <div className="progress-editor compact">
            <div>
              <p>Current page progress</p>
              <strong>{progress}%</strong>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(event) => {
              if (!requireLogin()) return;
                setProgress(event.target.value);
              }}
              aria-label="Reading progress"
            />
          </div>
        </section>

        <section className="search-panel">
          <img src={editorialImage} alt="" className="editorial-image" />
          <div className="search-content">
            <p className="eyebrow">Book database</p>
            <h2>Find any book by title, author, or ISBN</h2>
            <label className="search-box">
              <span>Connected to the full catalog later</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, author, or ISBN..."
              />
            </label>

            <div className="database-list">
              {filteredSuggestions.length > 0 ? (
                filteredSuggestions.slice(0, 5).map((book) => (
                  <button
                    type="button"
                    key={book.isbn}
                    onClick={() => {
                      if (!requireLogin()) return;
                      setQuery(book.title);
                      setTrackedBook(book);
                    }}
                  >
                    <span>
                      <strong>{book.title}</strong>
                      <small>{book.author}</small>
                    </span>
                    <small>{book.isbn}</small>
                  </button>
                ))
              ) : (
                <p>
                  No exact match yet. The full ISBN database will make this
                  search much deeper.
                </p>
              )}
            </div>

            <div className="progress-editor">
              <button
            className="primary-button full"
            type="button"
           onClick={() => {
          if (!requireLogin()) return;
    // later: add selected book to Supabase shelf
           }}
>
  Add to Shelf
</button>
            </div>
          </div>
        </section>
      </div>

      <section className="campus-favorites" aria-label="Editor's pick books">
        <div className="favorites-heading">
          <span className="bookmark-glyph" aria-hidden="true" />
          <div>
            <p className="eyebrow">Curated shelf</p>
            <h2>Editor's Picks</h2>
            <p className="favorites-blurb">
              seasonal recommendations from yours truly (carrie, jenna, yiru)
            </p>
          </div>
        </div>
        <div className="favorite-book-grid">
          {editorPicks.map((book) => (
            <article className={`favorite-book ${book.tone}`} key={book.title}>
              <div className="favorite-cover" aria-hidden="true">
                <span>{book.title}</span>
              </div>
              <div>
                <p>{book.author}</p>
                <h3>{book.title}</h3>
                <blockquote>{book.blurb}</blockquote>
                <div className="reader-cluster" aria-label={`${book.readers} readers`}>
                  <span />
                  <span />
                  <span />
                  <strong>{book.readers}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default Discover;
