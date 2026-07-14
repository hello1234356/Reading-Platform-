import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { editorPicks } from "../data/books";
import { recommendationLists } from "../data/recommendationLists";
import { useRequireLogin } from "../hooks/useRequireLogin";
import { useAuth } from "../hooks/useAuth";
import { addBookToLibrary } from "../lib/libraryApi";
import { getOpenLibraryBookDetails } from "../lib/openLibrary";
import { getUserProfile } from "../lib/profileApi";
import { saveReview } from "../lib/reviewApi";
import { addPublicReviewToFeed } from "../lib/socialFeed";
import BookDetailModal from "../components/BookDetailModal";
import ReviewModal from "../components/ReviewModal";

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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const searchHeroRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [query, setQuery] = useState(searchParams.get("search") || "");
  const [bookResults, setBookResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [savedBookKeys, setSavedBookKeys] = useState([]);
  const [savingBookKey, setSavingBookKey] = useState("");
  const [selectedShelves, setSelectedShelves] = useState({});
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookDetailLoading, setBookDetailLoading] = useState(false);
  const [bookDetailError, setBookDetailError] = useState("");
  const [reviewBook, setReviewBook] = useState(null);
  const [reviewDraft, setReviewDraft] = useState({
    rating: 5,
    review: "",
    visibility: "public",
  });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [selectedQuiz, setSelectedQuiz] = useState(readingQuizzes[0]);
  const featuredPick = editorPicks[0];
  const supportingPicks = editorPicks.slice(1);
  const authoredRecommendationPosts = recommendationLists.filter((list) => list.author);

  async function runBookSearch(searchTerm) {
    const normalizedSearchTerm = searchTerm.trim();

    if (!normalizedSearchTerm) {
      setBookResults([]);
      setSearchStatus("error");
      setSearchMessage("Enter a title, author, or ISBN to search.");
      return;
    }

    setSearchStatus("loading");
    setSearchMessage("");
    setBookResults([]);

    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(normalizedSearchTerm)}&fields=key,title,author_name,isbn,cover_i,first_publish_year&limit=10`,
      );

      if (!response.ok) {
        throw new Error("Open Library request failed");
      }

      const data = await response.json();

      if (!data.docs?.length) {
        setSearchStatus("error");
        setSearchMessage("Open Library could not find a matching book.");
        return;
      }

      setBookResults(
        data.docs.map((result) => ({
          openLibraryKey: result.key,
          isbn: result.isbn?.[0] || "",
          title: result.title || "Untitled",
          author: result.author_name?.join(", ") || "Unknown author",
          firstPublished: result.first_publish_year || null,
          coverUrl: result.cover_i
            ? `https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg`
            : "",
        })),
      );
      setSearchStatus("success");
    } catch {
      setSearchStatus("error");
      setSearchMessage("The book search is unavailable right now. Please try again.");
    }
  }

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setProfile(null);
        return;
      }

      try {
        setProfile(await getUserProfile(user.id));
      } catch (error) {
        console.error("Failed to load discovery profile:", error);
      }
    }

    loadProfile();
  }, [user?.id]);

  useEffect(() => {
    const searchTerm = searchParams.get("search") || "";

    if (searchTerm.trim()) {
      searchHeroRef.current?.scrollIntoView({ block: "start" });
      queueMicrotask(() => {
        searchHeroRef.current?.scrollIntoView({ block: "start" });
        runBookSearch(searchTerm);
      });
    }
  }, [searchParams]);

  async function searchBooks(event) {
    event.preventDefault();
    runBookSearch(query);
  }

  async function addToReadingList(book) {
  if (!requireLogin()) return;

  if (!user?.id) {
    setSearchStatus("error");
    setSearchMessage("Your login session is still loading. Please try again.");
    return;
  }

	  const bookKey = book.isbn || book.openLibraryKey;
    const targetShelf = selectedShelves[bookKey] || "to-be-read";

	  setSavingBookKey(bookKey);
	  setSearchMessage("");

	  try {
	    const savedLibraryBook = await addBookToLibrary(user.id, book, targetShelf);

	    setSavedBookKeys((currentKeys) =>
	      currentKeys.includes(bookKey)
        ? currentKeys
        : [...currentKeys, bookKey],
	    );

	    setSearchMessage(
	      `${book.title} was added to ${
          targetShelf === "read"
            ? "your Read shelf"
            : targetShelf === "currently-reading"
              ? "Currently Reading"
              : "To Be Read"
        }.`,
	    );

      if (targetShelf === "read") {
        setReviewBook({
          ...book,
          bookId: savedLibraryBook.book.id,
          coverUrl: book.coverUrl || savedLibraryBook.book.cover_url || "",
        });
        setReviewDraft({ rating: 5, review: "", visibility: "public" });
        setReviewError("");
      }
	  } catch (error) {
    console.error("Failed to add book to library:", error);
    setSearchStatus("error");
    setSearchMessage(error.message || "Could not save this book.");
  } finally {
    setSavingBookKey("");
  }
}
function getBookKey(book) {
  return book.isbn || book.openLibraryKey;
}

function isBookSaved(book) {
  return savedBookKeys.includes(getBookKey(book));
}

async function submitReview(event) {
  event.preventDefault();

  if (!requireLogin() || !reviewBook?.bookId || !user?.id) return;

  setReviewSaving(true);
  setReviewError("");

  try {
	    await saveReview({
	      userId: user.id,
	      bookId: reviewBook.bookId,
	      rating: reviewDraft.rating,
	      reviewText: reviewDraft.review,
	    });

      if (reviewDraft.visibility === "public") {
        addPublicReviewToFeed({
          book: reviewBook,
          rating: reviewDraft.rating,
          reviewText: reviewDraft.review,
          user,
          profile,
        });
      }
	
	    setReviewBook(null);
	    setReviewDraft({ rating: 5, review: "", visibility: "public" });
	    setSearchMessage(`${reviewBook.title} was added to Read with your review.`);
  } catch (error) {
    console.error("Failed to save review:", error);
    setReviewError(error.message || "Could not save this review.");
  } finally {
    setReviewSaving(false);
  }
}

async function openBookDetails(book) {
  setSelectedBook({
    ...book,
    description: book.description || "Loading official description...",
  });
  setBookDetailLoading(true);
  setBookDetailError("");

  const details = await getOpenLibraryBookDetails(book);
  setSelectedBook(details);
  setBookDetailError(details.error || "");
  setBookDetailLoading(false);
}

  return (
    <section className="home-page discover-page" aria-label="Discover books">
      <header className="discover-search-hero" ref={searchHeroRef}>
        <div className="discover-page-title">
          <p className="eyebrow">Find your next shelf obsession</p>
          <h1>Discover</h1>
        </div>
        <form className="discovery-search-bar" onSubmit={searchBooks}>
          <label className="sr-only" htmlFor="book-search">Book title, author, or ISBN</label>
          <input
            id="book-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, author, or ISBN..."
          />
          <button type="submit" disabled={searchStatus === "loading"}>
            {searchStatus === "loading" ? "Searching..." : "Search"}
          </button>
        </form>
        <div className="isbn-search-feedback" aria-live="polite">
          {searchMessage ? <p className="isbn-search-message">{searchMessage}</p> : null}
          {bookResults.length > 0 ? (
            <div className="book-search-results" aria-label="Open Library search results">
              {bookResults.map((book) => {
                const isSaved = isBookSaved(book);
                const isSaving = savingBookKey === getBookKey(book);

                return (
	                  <article className="isbn-search-result" key={`${book.openLibraryKey}-${book.isbn}`}>
	                    <button
                        className="isbn-result-details-button"
                        type="button"
                        onClick={() => openBookDetails(book)}
                        aria-label={`View details for ${book.title}`}
                      >
                        <div className="isbn-result-cover">
                          {book.coverUrl ? (
                            <img src={book.coverUrl} alt={`Cover of ${book.title}`} />
                          ) : (
                            <span>No cover available</span>
                          )}
                        </div>
                        <div>
                          <p className="eyebrow">Open Library result</p>
                          <h2>{book.title}</h2>
                          <p className="isbn-result-author">{book.author}</p>
                          {book.firstPublished ? <small>First published {book.firstPublished}</small> : null}
                          {book.isbn ? <small>ISBN {book.isbn}</small> : null}
                        </div>
                      </button>
	                    <div className="isbn-result-actions">
                        <label className="isbn-shelf-choice">
                          <span>Add to</span>
                          <select
                            value={selectedShelves[getBookKey(book)] || "to-be-read"}
                            onChange={(event) =>
                              setSelectedShelves((currentShelves) => ({
                                ...currentShelves,
                                [getBookKey(book)]: event.target.value,
                              }))
                            }
                            disabled={isSaving}
                          >
                            <option value="to-be-read">To Be Read</option>
                            <option value="currently-reading">Currently Reading</option>
                            <option value="read">Read</option>
                          </select>
                        </label>
		                   <button
	                      className="primary-button"
	                      type="button"
                      disabled={isSaved || isSaving}
                      onClick={() => addToReadingList(book)}
                    >
                      {isSaving
                        ? "Adding..."
                        : isSaved
                          ? "Added to Reading List"
                          : "Add to My Shelf"}
	                    </button>
	                    </div>
	                  </article>
                );
              })}
            </div>
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
	
            {authoredRecommendationPosts.length > 0 ? (
              <section className="themed-lists-section" aria-label="Student recommendation posts">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Student Essays</p>
                    <h2>Recommendation Posts</h2>
                  </div>
                </div>
                <div className="themed-list-grid">
                  {authoredRecommendationPosts.map((list) => (
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
                        <em>By {list.author}</em>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

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
      <BookDetailModal
        book={selectedBook}
        loading={bookDetailLoading}
        error={bookDetailError}
        onClose={() => {
          setSelectedBook(null);
          setBookDetailError("");
          setBookDetailLoading(false);
        }}
      />
      <ReviewModal
        book={reviewBook}
        draft={reviewDraft}
        saving={reviewSaving}
        error={reviewError}
        showVisibility
        onChange={setReviewDraft}
        onClose={() => {
          if (!reviewSaving) {
            setReviewBook(null);
            setReviewError("");
          }
        }}
        onSubmit={submitReview}
      />
    </section>
  );
}

export default Discover;
