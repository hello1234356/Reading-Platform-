import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { bookDatabasePreview, editorPicks } from "../data/books";
import { recommendationLists } from "../data/recommendationLists";
import { useRequireLogin } from "../hooks/useRequireLogin";

function getCoverUrl(isbn, size = "L") {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false` : "";
}

function hideBrokenCover(event) {
  event.currentTarget.hidden = true;
}

const readingQuizzes = [
  {
    title: "Discover Your Reading Identity",
    blurb: "Are you a margin-note romantic, a plot loyalist, or a sentence collector?",
  },
  {
    title: "Your MBTI Based on Favorite Books",
    blurb: "Choose your shelves and we will wildly overinterpret them, affectionately.",
  },
  {
    title: "Favorite Movies to Next Reads",
    blurb: "Tell us the films you rewatch and get a stack for your weekend.",
  },
];

function Discover() {
  const { requireLogin } = useRequireLogin();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("search") || "");
  const [selectedQuiz, setSelectedQuiz] = useState(readingQuizzes[0]);
  const featuredPick = editorPicks[0];
  const supportingPicks = editorPicks.slice(1);

  const filteredSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return bookDatabasePreview.slice(0, 5);
    }

    return bookDatabasePreview.filter((book) =>
      [book.title, book.author, book.isbn, book.shelf]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);

  return (
    <section className="home-page discover-page" aria-label="Discover books">
      <header className="discover-search-hero">
        <div className="discover-page-title">
          <p className="eyebrow">Find your next shelf obsession</p>
          <h1>Discover</h1>
        </div>
        <label className="discovery-search-bar">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search books, authors, ISBNs..."
          />
          <span aria-hidden="true">⌕</span>
        </label>
        <div className="discovery-suggestion-list" aria-label="Book search suggestions">
          {query.trim() && filteredSuggestions.length > 0 ? (
            filteredSuggestions.map((book) => (
              <button
                type="button"
                key={book.isbn}
                onClick={() => {
                  if (!requireLogin()) return;
                  setQuery(book.title);
                }}
              >
                <span>
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                </span>
                <em>{book.isbn}</em>
              </button>
            ))
          ) : query.trim() ? (
            <p>No match yet. The full ISBN database will make this much deeper.</p>
          ) : null}
        </div>
      </header>

      <div className="discovery-layout">
        <main className="discovery-main">
          <section className="discovery-editor-picks" aria-label="This month's editor picks">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Carrie, Jenna, Yiru</p>
                <h2>Monthly Editors' Picks</h2>
              </div>
            </div>
            <div className="discovery-pick-showcase">
              <article className={`discovery-featured-pick ${featuredPick.tone}`}>
                <div className="discovery-book-cover featured" aria-hidden="true">
                  {featuredPick.isbn && (
                    <img
                      src={getCoverUrl(featuredPick.isbn)}
                      alt=""
                      loading="lazy"
                      onError={hideBrokenCover}
                    />
                  )}
                  <span>{featuredPick.title}</span>
                </div>
                <div>
                  <p>Recommended by the editors</p>
                  <h3>{featuredPick.title}</h3>
                  <blockquote>{featuredPick.blurb}</blockquote>
                  <button type="button" onClick={requireLogin}>Read More</button>
                </div>
              </article>

              <div className="discovery-pick-grid">
                {supportingPicks.map((book) => (
                  <article className={`discovery-pick-card ${book.tone}`} key={book.title}>
                    <div className="discovery-book-cover" aria-hidden="true">
                      {book.isbn && (
                        <img
                          src={getCoverUrl(book.isbn)}
                          alt=""
                          loading="lazy"
                          onError={hideBrokenCover}
                        />
                      )}
                      <span>{book.title}</span>
                    </div>
                    <div>
                      <p>{book.author}</p>
                      <h3>{book.title}</h3>
                      <blockquote>{book.blurb}</blockquote>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="themed-lists-section" aria-label="Themed recommendation lists">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Themed Lists</p>
                <h2>Recommendation Posts</h2>
              </div>
            </div>
            <div className="themed-list-grid">
              {recommendationLists.map((list) => (
                <Link
                  className={`themed-list-card ${list.tone}`}
                  key={list.title}
                  to={`/discover/lists/${list.slug}`}
                >
                  <div className="themed-list-preview" aria-hidden="true">
                    <img src={list.imageUrl} alt="" loading="lazy" />
                  </div>
                  <div>
                    <p>{list.kicker}</p>
                    <h3>{list.title}</h3>
                    <small>{list.blurb}</small>
                    <em>{list.count} books</em>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </main>

        <aside className="discovery-quiz-rail" aria-label="Reading quizzes">
          <p className="eyebrow">Occasional Quiz</p>
          <h2>{selectedQuiz.title}</h2>
          <p>{selectedQuiz.blurb}</p>
          <button
            className="primary-button full"
            type="button"
            onClick={() => {
              if (!requireLogin()) return;
            }}
          >
            Take Quiz
          </button>
          <div className="quiz-option-list">
            {readingQuizzes.map((quiz) => (
              <button
                type="button"
                className={selectedQuiz.title === quiz.title ? "active" : ""}
                key={quiz.title}
                onClick={() => setSelectedQuiz(quiz)}
              >
                {quiz.title}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default Discover;
