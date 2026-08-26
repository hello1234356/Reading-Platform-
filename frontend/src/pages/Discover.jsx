import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { editorPicks } from "../data/books";
import { recommendationLists } from "../data/recommendationLists";
import { useRequireLogin } from "../hooks/useRequireLogin";
import { useAuth } from "../hooks/useAuth";
import { addBookToLibrary } from "../lib/libraryApi";
import {
  getGoogleBooksCoverUrl,
  getPreferredGoogleBooksCoverUrl,
} from "../lib/googleBooks";
import { searchBooksByQueryLanguage } from "../lib/bookSearch";
import {
  applyBookModerationUpdate,
  moderateBookSearchResults,
} from "../lib/bookModerationApi.js";
import { createLatestRequestGate } from "../lib/bookSearchRelevance";
import { getBookSourceLabel } from "../lib/bookSource.js";
import { submitBookSubmission } from "../lib/bookSubmissions";
import { loadBookDetailsSafely, loadProviderBookDetails } from "../lib/bookDetails";
import {
  getOpenLibraryIsbnCoverUrl,
} from "../lib/openLibraryBooks";
import { getRecentFinishedBooks, saveReview } from "../lib/reviewApi";
import BookDetailModal from "../components/BookDetailModal";
import BookModerationStatus from "../components/BookModerationStatus";
import ReviewModal from "../components/ReviewModal";
import StarRating from "../components/StarRating";
import { createPost } from "../lib/postApi";
import { getCatalogBookById } from "../lib/communityBooks";

function getCoverUrl(isbn, size = "L") {
  return getGoogleBooksCoverUrl(isbn, size === "M" ? 1 : 2);
}

function getEditorPickCoverUrl(book) {
  return (
    String(book?.coverUrl || "").trim() ||
    getOpenLibraryIsbnCoverUrl(book?.isbn) ||
    getCoverUrl(book?.isbn)
  );
}

function hideBrokenCover(event, isbn) {
  const fallbackUrl = getOpenLibraryIsbnCoverUrl(isbn);

  if (fallbackUrl && event.currentTarget.src !== fallbackUrl) {
    event.currentTarget.src = fallbackUrl;
    return;
  }

  event.currentTarget.hidden = true;
}

function EditorPickCover({ book, featured = false }) {
  const [coverSrc, setCoverSrc] = useState(getEditorPickCoverUrl(book));
  const [hasImage, setHasImage] = useState(Boolean(coverSrc));

  useEffect(() => {
    const nextCoverSrc = getEditorPickCoverUrl(book);
    // Synchronize state when a different editor pick is rendered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoverSrc(nextCoverSrc);
    setHasImage(Boolean(nextCoverSrc));
  }, [book]);

  function handleCoverError() {
    const openLibraryCoverUrl = getOpenLibraryIsbnCoverUrl(book?.isbn);

    if (openLibraryCoverUrl && coverSrc !== openLibraryCoverUrl) {
      setCoverSrc(openLibraryCoverUrl);
      return;
    }

    const googleCoverUrl = getCoverUrl(book?.isbn);

    if (googleCoverUrl && coverSrc !== googleCoverUrl) {
      setCoverSrc(googleCoverUrl);
      return;
    }

    setHasImage(false);
  }

  return (
    <div className={featured ? "discovery-book-cover featured" : "discovery-book-cover"} aria-hidden="true">
      {hasImage ? (
        <img
          src={coverSrc}
          alt=""
          loading="lazy"
          onError={handleCoverError}
        />
      ) : null}
      {!hasImage ? <span>{book.title}</span> : null}
    </div>
  );
}

function simplifySearchTerm(searchTerm) {
  return searchTerm
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getInternalBookId(book) {
  return book?.bookId || book?.id || "";
}

const initialSubmissionDraft = {
  title: "",
  author: "",
  language: "en",
  isbn: "",
  publisher: "",
  publicationYear: "",
  description: "",
  coverUrl: "",
};

function SubmitBookEntry({ hasResults, onSubmitBook }) {
  return (
    <div className="submit-book-entry">
      <span>
        {hasResults ? "Still can't find your book?" : "Can't find your book?"}
      </span>
      <button className="primary-button" type="button" onClick={onSubmitBook}>
        Submit Book for Review
      </button>
    </div>
  );
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function Discover() {
  const { requireLogin } = useRequireLogin();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const bookDeepLinkHandledRef = useRef("");
  const bookSearchGateRef = useRef(createLatestRequestGate());
  const searchHeroRef = useRef(null);
  const [query, setQuery] = useState(searchParams.get("search") || "");
  const [bookResults, setBookResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [recentFinishes, setRecentFinishes] = useState([]);
  const [recentFinishesLoading, setRecentFinishesLoading] = useState(true);
  const [recentFinishesError, setRecentFinishesError] = useState("");
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
    visibility: "private",
  });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [submissionDraft, setSubmissionDraft] = useState(initialSubmissionDraft);
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const submissionSentinelRef = useRef(null);
  const [floatingSubmissionUnlocked, setFloatingSubmissionUnlocked] =
    useState(false);
  const featuredPick = editorPicks[0];
  const supportingPicks = editorPicks.slice(1);
  const authoredRecommendationPosts = recommendationLists.filter(
    (list) => list.body,
  );
  const shouldShowZeroResultSubmission =
    query.trim() &&
    searchStatus === "error" &&
    bookResults.length === 0 &&
    searchMessage.startsWith("No matching books found");
  const shouldShowResultSubmission =
    query.trim() && searchStatus === "success" && bookResults.length > 0;
  const shouldUseFloatingSubmission =
    shouldShowResultSubmission && bookResults.length > 12;
  const shouldShowFloatingSubmission =
    shouldUseFloatingSubmission &&
    floatingSubmissionUnlocked &&
    query.trim() &&
    searchStatus === "success";

  useEffect(() => {
    const targetBookId = searchParams.get("bookId") || "";
    if (!targetBookId || bookDeepLinkHandledRef.current === targetBookId) return;
    bookDeepLinkHandledRef.current = targetBookId;
    let cancelled = false;
    async function openTargetBook() {
      try {
        const targetBook = await getCatalogBookById(targetBookId);
        if (!cancelled && targetBook) await openBookDetails(targetBook);
      } catch (error) {
        if (!cancelled) console.error("Notification book target is unavailable:", error);
      }
    }
    void openTargetBook();
    return () => { cancelled = true; };
  }, [searchParams]);

  async function refreshRecentFinishes({ showLoading = false } = {}) {
    if (showLoading) {
      setRecentFinishesLoading(true);
    }

    setRecentFinishesError("");

    try {
      const finishedBooks = await getRecentFinishedBooks(10);
      setRecentFinishes(finishedBooks);
    } catch (error) {
      console.error("Failed to load recent finished books:", error);
      setRecentFinishesError("Recent finishes are unavailable right now.");
    } finally {
      if (showLoading) {
        setRecentFinishesLoading(false);
      }
    }
  }

  async function runBookSearch(searchTerm) {
    // The Edge classifier is intentionally authenticated and rate-limited.
    // Keep the public editorial page readable, but do not start a provider
    // search whose moderation phase cannot legally complete.
    if (authLoading) return;
    if (!user?.id) {
      requireLogin();
      return;
    }
    const requestId = bookSearchGateRef.current.begin();
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
      const simplifiedSearchTerm = simplifySearchTerm(normalizedSearchTerm);
      let searchResult = await searchBooksByQueryLanguage(normalizedSearchTerm);
      if (!bookSearchGateRef.current.isCurrent(requestId)) return;
      let { results } = searchResult;

      if (!results.length && simplifiedSearchTerm !== normalizedSearchTerm) {
        searchResult = await searchBooksByQueryLanguage(simplifiedSearchTerm);
        if (!bookSearchGateRef.current.isCurrent(requestId)) return;
        ({ results } = searchResult);
      }

      if (!results.length) {
        setSearchStatus("error");
        setSearchMessage(searchResult.moderationMessage ||
          "No matching books found. Check the spelling, try fewer words, or search by author, title, or ISBN.");
        return;
      }

      setBookResults(results);
      setSearchStatus("success");
      setSearchMessage("");
      void searchResult.startModeration((key, moderationStatus, details = {}) => {
        if (!bookSearchGateRef.current.isCurrent(requestId)) return;
        setBookResults((current) => current.map((book) =>
          applyBookModerationUpdate(book, key, moderationStatus, details)));
      });
    } catch (error) {
      if (!bookSearchGateRef.current.isCurrent(requestId)) return;
      setSearchStatus("error");
      setSearchMessage(error.message || "The book search is unavailable right now. Please try again.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadRecentFinishes() {
      setRecentFinishesLoading(true);
      setRecentFinishesError("");

      try {
        const finishedBooks = await getRecentFinishedBooks(10);

        if (!cancelled) {
          setRecentFinishes(finishedBooks);
        }
      } catch (error) {
        console.error("Failed to load recent finished books:", error);

        if (!cancelled) {
          setRecentFinishesError("Recent finishes are unavailable right now.");
        }
      } finally {
        if (!cancelled) {
          setRecentFinishesLoading(false);
        }
      }
    }

    loadRecentFinishes();

    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    const searchTerm = searchParams.get("search") || "";

    if (searchTerm.trim()) {
      searchHeroRef.current?.scrollIntoView({ block: "start" });
      queueMicrotask(() => {
        searchHeroRef.current?.scrollIntoView({ block: "start" });
        runBookSearch(searchTerm);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, authLoading, user?.id]);

  useEffect(() => {
    // Reset the sentinel when a new result set starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFloatingSubmissionUnlocked(false);
  }, [query, bookResults.length, searchStatus]);

  useEffect(() => {
    if (!shouldUseFloatingSubmission || searchStatus !== "success") return;

    const sentinel = submissionSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setFloatingSubmissionUnlocked(true);
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [shouldUseFloatingSubmission, searchStatus, bookResults]);

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

	  const bookKey = getBookKey(book);
    const targetShelf = selectedShelves[bookKey] || "to-be-read";

	  setSavingBookKey(bookKey);
	  setSearchMessage("");

	  try {
	    const savedLibraryBook = await addBookToLibrary(user.id, book, targetShelf);

      const savedBookKey = getBookKey({
        ...book,
        bookId: savedLibraryBook.book.id,
      });

	    setSavedBookKeys((currentKeys) => {
        const nextKeys = [bookKey, savedBookKey].filter(Boolean);
        const missingKeys = nextKeys.filter(
          (key) => !currentKeys.includes(key),
        );

        return missingKeys.length > 0
          ? [...currentKeys, ...missingKeys]
          : currentKeys;
      });

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
        await refreshRecentFinishes();
        setReviewBook({
          ...book,
          bookId: savedLibraryBook.book.id,
          coverUrl: getPreferredGoogleBooksCoverUrl(
            book.coverUrl || savedLibraryBook.book.cover_url,
            book.isbn || savedLibraryBook.book.isbn,
          ),
        });
        setReviewDraft({ rating: 5, review: "", visibility: "private" });
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
  return (
    getInternalBookId(book) ||
    book.isbn ||
    book.googleBooksId ||
    book.openLibraryKey ||
    book.editionKey
  );
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
      await createPost({
        userId: user.id,
        bookId: reviewBook.bookId,
        postType: "review",
        progress: 100,
        rating: reviewDraft.rating,
        note:
          reviewDraft.review.trim() ||
          `Rated ${reviewDraft.rating.toFixed(1)} open books`,
      });
    }
	
	    setReviewBook(null);
	    setReviewDraft({ rating: 5, review: "", visibility: "private" });
      await refreshRecentFinishes();
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

  try {
    const result = await loadBookDetailsSafely(book, loadProviderBookDetails);
    setSelectedBook(result.details);
    setBookDetailError(result.error);
  } finally {
    setBookDetailLoading(false);
  }
}

async function retryBookModeration(book) {
  const key = book.moderationKey;
  setBookResults((current) => current.map((item) => item.moderationKey === key
    ? { ...item, moderationStatus: "checking", moderationFailureCode: "" }
    : item));
  await moderateBookSearchResults([book], (updateKey, moderationStatus, details = {}) => {
    setBookResults((current) => current.map((item) =>
      applyBookModerationUpdate(item, updateKey, moderationStatus, details)));
  });
}

function openSubmissionForm() {
  if (!requireLogin()) return;

  setSubmissionDraft({
    ...initialSubmissionDraft,
    title: query.trim(),
  });
  setSubmissionError("");
  setIsSubmissionOpen(true);
}

function closeSubmissionForm() {
  if (submissionSaving) return;

  setIsSubmissionOpen(false);
  setSubmissionError("");
  setSubmissionDraft(initialSubmissionDraft);
}

function updateSubmissionDraft(field, value) {
  setSubmissionDraft((currentDraft) => ({
    ...currentDraft,
    [field]: value,
  }));
}

async function submitMissingBook(event) {
  event.preventDefault();

  if (!requireLogin()) return;

  const title = submissionDraft.title.trim();
  const author = submissionDraft.author.trim();
  const language = submissionDraft.language.trim();
  const publicationYearText = submissionDraft.publicationYear.trim();
  const coverUrl = submissionDraft.coverUrl.trim();
  const description = submissionDraft.description.trim();

  if (!title) {
    setSubmissionError("Enter the book title.");
    return;
  }

  if (!author) {
    setSubmissionError("Enter the author.");
    return;
  }

  if (!language) {
    setSubmissionError("Choose a language.");
    return;
  }

  if (!coverUrl) {
    setSubmissionError("Enter a cover image URL.");
    return;
  }

  if (!isHttpUrl(coverUrl)) {
    setSubmissionError("Enter a valid http:// or https:// cover image URL.");
    return;
  }

  if (!publicationYearText) {
    setSubmissionError("Enter the publication year.");
    return;
  }

  const publicationYear = Number(publicationYearText);
  const currentYear = new Date().getFullYear();

  if (
    !Number.isInteger(publicationYear) ||
    publicationYear < 1 ||
    publicationYear > currentYear
  ) {
    setSubmissionError("Enter a valid publication year.");
    return;
  }

  if (!description) {
    setSubmissionError("Enter a description.");
    return;
  }

  setSubmissionSaving(true);
  setSubmissionError("");

  try {
    await submitBookSubmission({
      ...submissionDraft,
      title,
      author,
      language,
      coverUrl,
      publicationYear: publicationYearText,
      description,
    });

    setSearchMessage(
      "Book submitted for review. It will become available after approval.",
    );
    setSubmissionDraft(initialSubmissionDraft);
    setIsSubmissionOpen(false);
  } catch (error) {
    console.error("Failed to submit book:", error);
    setSubmissionError(
      error.message || "Could not submit this book. Please try again.",
    );
  } finally {
    setSubmissionSaving(false);
  }
}

  return (
    <section className="home-page discover-page" aria-label="Discover books">
      <header className="discover-search-hero" ref={searchHeroRef}>
        <div className="discover-page-title">
          <p className="eyebrow">Find your next shelf obsession</p>
          <h1>Discover</h1>
          <p className="school-motto">Try, and all is possible.</p>
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
        <section className="recent-finishes" aria-labelledby="recent-finishes-title">
          <div className="recent-finishes-heading">
            <div>
              <p className="eyebrow">Around the reading room</p>
              <h2 id="recent-finishes-title">Recently Finished</h2>
            </div>
            <span>Anonymous activity</span>
          </div>

          {recentFinishesLoading ? (
            <p className="recent-finishes-status">Loading recent finishes...</p>
          ) : recentFinishesError ? (
            <p className="recent-finishes-status" role="alert">{recentFinishesError}</p>
          ) : recentFinishes.length === 0 ? (
            <p className="recent-finishes-status">No finished books yet.</p>
          ) : (
            <div className="recent-finishes-list">
              {recentFinishes.map((book) => (
                <button
                  className="recent-finish-card"
                  type="button"
                  key={book.id}
                  onClick={() => openBookDetails(book)}
                  aria-label={
                    book.rating == null
                      ? `View ${book.title}, finished anonymously`
                      : `View ${book.title}, rated ${book.rating} out of 5 anonymously`
                  }
                >
                  <div className="recent-finish-cover" aria-hidden="true">
                    {(book.coverUrl || book.isbn) ? (
                      <img
                        src={book.coverUrl || getCoverUrl(book.isbn, "M")}
                        alt=""
                        loading="lazy"
                        onError={(event) => hideBrokenCover(event, book.isbn)}
                      />
                    ) : (
                      <span>{book.title}</span>
                    )}
                  </div>
                  <div>
                    <strong>{book.title}</strong>
                    <small>{book.author}</small>
                    {book.rating == null ? (
                      <span className="recent-finish-rating">Finished</span>
                    ) : (
                      <span
                        className="recent-finish-rating"
                        aria-label={`${book.rating.toFixed(1)} out of 5 open books`}
                      >
                        <StarRating rating={book.rating} size={14} />
                        {book.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="isbn-search-feedback" aria-live="polite">
          {searchMessage ? <p className="isbn-search-message">{searchMessage}</p> : null}
          {bookResults.length > 0 ? (
            <div className="book-search-results" aria-label="Book search results">
              {bookResults.map((book, index) => {
                const isSaved = isBookSaved(book);
                const isSaving = savingBookKey === getBookKey(book);
                const isModerationApproved = book.moderationStatus === "approved";
                const shouldInsertInlineSubmissionEntry =
                  shouldShowResultSubmission &&
                  !shouldUseFloatingSubmission &&
                  index === bookResults.length - 1;
                const shouldInsertSubmissionSentinel =
                  shouldUseFloatingSubmission && index === 11;

                const resultCard = (
	                  <article className="isbn-search-result" key={getBookKey(book)}>
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
                            <p className="eyebrow">
                              {getBookSourceLabel(book)}
                            </p>
                            <h2>{book.title}</h2>
                            <p className="isbn-result-author">{book.author}</p>
                            {book.firstPublished ? <small>First published {book.firstPublished}</small> : null}
                            {book.isbn ? <small>ISBN {book.isbn}</small> : null}
                          </div>
                        </button>
	                      <BookModerationStatus book={book} onRetry={retryBookModeration} />
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
                              disabled={isSaving || !isModerationApproved}
                            >
                              <option value="to-be-read">To Be Read</option>
                              <option value="currently-reading">Currently Reading</option>
                              <option value="read">Read</option>
                            </select>
                          </label>
		                      <button
	                        className="primary-button"
	                        type="button"
                          disabled={isSaved || isSaving || !isModerationApproved}
                          onClick={() => addToReadingList(book)}
                        >
                          {isSaving
                            ? "Adding..."
                            : isSaved
                              ? "Added to Reading List"
                              : book.moderationStatus === "checking"
                                ? "Add to Shelf — checking…"
                                : "Add to My Shelf"}
	                      </button>
	                    </div>
	                  </article>
                );

                if (!shouldInsertInlineSubmissionEntry && !shouldInsertSubmissionSentinel) {
                  return resultCard;
                }

                if (shouldInsertSubmissionSentinel) {
                  return [
                    resultCard,
                    <span
                      className="submit-book-scroll-sentinel"
                      key="submit-book-scroll-sentinel"
                      ref={submissionSentinelRef}
                      aria-hidden="true"
                    />,
                  ];
                }

                return [
                  resultCard,
                      <SubmitBookEntry
                        key="submit-book-entry"
                        hasResults
                        onSubmitBook={openSubmissionForm}
                      />,
                ];
              })}
            </div>
          ) : null}
          {shouldShowZeroResultSubmission ? (
            <SubmitBookEntry hasResults={false} onSubmitBook={openSubmissionForm} />
          ) : null}
        </div>
      </header>
      {shouldShowFloatingSubmission ? (
        <div className="submit-book-floating-cta">
          <span>Still can't find your book?</span>
          <button className="primary-button" type="button" onClick={openSubmissionForm}>
            Submit Book for Review
          </button>
        </div>
      ) : null}

      <div className="discovery-layout">
        <main className="discovery-main">
          <section className="discovery-editor-picks" aria-label="This month's editor picks">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Seasonal shelf</p>
                <h2>Monthly Editors' Picks</h2>
              </div>
            </div>
            <div className="discovery-pick-showcase">
              <button
                className={`discovery-featured-pick ${featuredPick.tone}`}
                type="button"
                onClick={() => openBookDetails(featuredPick)}
                aria-label={`View details for ${featuredPick.title}`}
              >
                <EditorPickCover book={featuredPick} featured />
                <div>
                  <p>Recommended by the editors</p>
                  <h3>{featuredPick.title}</h3>
                  <blockquote>{featuredPick.blurb}</blockquote>
                  <span className="editor-pick-cta">Read More</span>
                </div>
              </button>

              <div className="discovery-pick-grid">
                {supportingPicks.map((book) => (
                  <button
                    className={`discovery-pick-card ${book.tone}`}
                    type="button"
                    key={book.title}
                    onClick={() => openBookDetails(book)}
                    aria-label={`View details for ${book.title}`}
                  >
                    <EditorPickCover book={book} />
                    <div>
                      <p>{book.author}</p>
                      <h3>{book.title}</h3>
                      <blockquote>{book.blurb}</blockquote>
                    </div>
                  </button>
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
                      className={`themed-list-card ${list.tone} ${list.language === "zh" ? "zh-list-card" : ""}`}
                      key={list.title}
                      to={`/discover/lists/${list.slug}`}
                    >
                      <div className="themed-list-preview" aria-hidden="true">
                        {list.imageUrl ? (
                          <img src={list.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <div className="themed-list-title-card">
                            <span>{list.kicker}</span>
                            <strong>{list.coverTitle || list.title}</strong>
                          </div>
                        )}
                      </div>
                      <div>
                        <p>{list.kicker}</p>
                        <h3>{list.title}</h3>
                        <small>{list.blurb}</small>
                        {list.username ? <em>By {list.username}</em> : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

	        </main>

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
      {isSubmissionOpen ? (
        <div
          className="composer-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSubmissionForm();
            }
          }}
        >
          <section className="composer-modal submit-book-modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              type="button"
              aria-label="Close book submission"
              onClick={closeSubmissionForm}
              disabled={submissionSaving}
            >
              ×
            </button>
            <h2>Submit a book</h2>
            <form onSubmit={submitMissingBook}>
              <label>
                <span>Title *</span>
                <input
                  type="text"
                  value={submissionDraft.title}
                  onChange={(event) => updateSubmissionDraft("title", event.target.value)}
                  disabled={submissionSaving}
                  required
                />
              </label>
              <label>
                <span>Author *</span>
                <input
                  type="text"
                  value={submissionDraft.author}
                  onChange={(event) => updateSubmissionDraft("author", event.target.value)}
                  disabled={submissionSaving}
                  required
                />
              </label>
              <label>
                <span>Language *</span>
                <select
                  value={submissionDraft.language}
                  onChange={(event) => updateSubmissionDraft("language", event.target.value)}
                  disabled={submissionSaving}
                  required
                >
                  <option value="en">English</option>
                  <option value="zh">Chinese</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                <span>ISBN</span>
                <input
                  type="text"
                  value={submissionDraft.isbn}
                  onChange={(event) => updateSubmissionDraft("isbn", event.target.value)}
                  disabled={submissionSaving}
                />
              </label>
              <label>
                <span>Publisher</span>
                <input
                  type="text"
                  value={submissionDraft.publisher}
                  onChange={(event) => updateSubmissionDraft("publisher", event.target.value)}
                  disabled={submissionSaving}
                />
              </label>
              <label>
                <span>Publication year *</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={new Date().getFullYear()}
                  value={submissionDraft.publicationYear}
                  onChange={(event) => updateSubmissionDraft("publicationYear", event.target.value)}
                  disabled={submissionSaving}
                  required
                />
              </label>
              <label>
                <span>Cover image URL *</span>
                <input
                  type="url"
                  value={submissionDraft.coverUrl}
                  onChange={(event) => updateSubmissionDraft("coverUrl", event.target.value)}
                  disabled={submissionSaving}
                  required
                />
                <small className="submit-book-field-help">
                  Find the book cover online, right-click the image and choose "Copy Image Address," then paste the link here. Please use a direct, publicly accessible image link.
                </small>
              </label>
              <label>
                <span>Description *</span>
                <textarea
                  value={submissionDraft.description}
                  onChange={(event) => updateSubmissionDraft("description", event.target.value)}
                  disabled={submissionSaving}
                  rows={4}
                  required
                />
              </label>
              {submissionError ? (
                <p className="profile-save-error" role="alert">{submissionError}</p>
              ) : null}
              <button className="primary-button full" type="submit" disabled={submissionSaving}>
                {submissionSaving ? "Submitting..." : "Submit for Review"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Discover;
