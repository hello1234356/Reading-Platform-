import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { editorPicks } from "../data/books";
import { recommendationLists } from "../data/recommendationLists";
import { useRequireLogin } from "../hooks/useRequireLogin";
import { useAuth } from "../hooks/useAuth";
import { addBookToLibrary } from "../lib/libraryApi";
import {
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
import {
  enrichMissingBookCovers,
  loadBookDetailsSafely,
  loadProviderBookDetails,
} from "../lib/bookDetails";
import { getRecentFinishedBooks, saveReview } from "../lib/reviewApi";
import BookDetailModal from "../components/BookDetailModal";
import BookCoverImage from "../components/BookCoverImage";
import BookModerationStatus from "../components/BookModerationStatus";
import ReviewModal from "../components/ReviewModal";
import StarRating from "../components/StarRating";
import { createPost } from "../lib/postApi";
import { getCatalogBookById } from "../lib/communityBooks";

function getEditorPickCoverUrl(book) {
  return String(book?.coverUrl || "").trim();
}

function EditorPickCover({ book, featured = false }) {
  return (
    <div className={featured ? "discovery-book-cover featured" : "discovery-book-cover"} aria-hidden="true">
      <BookCoverImage
        src={getEditorPickCoverUrl(book)}
        alt=""
        loading="lazy"
      />
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
  const { t } = useTranslation();
  return (
    <div className="submit-book-entry">
      <span>
        {hasResults ? t("search.stillMissing") : t("search.submitMissing")}
      </span>
      <button className="primary-button" type="button" onClick={onSubmitBook}>
        {t("search.submitReview")}
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
  const { t } = useTranslation();
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
  const [resolvedEditorPicks, setResolvedEditorPicks] = useState(editorPicks);
  const submissionSentinelRef = useRef(null);
  const [floatingSubmissionUnlocked, setFloatingSubmissionUnlocked] =
    useState(false);
  const featuredPick = resolvedEditorPicks[0];
  const supportingPicks = resolvedEditorPicks.slice(1);
  const authoredRecommendationPosts = recommendationLists.filter(
    (list) => list.body,
  );
  const shouldShowZeroResultSubmission =
    query.trim() &&
    searchStatus === "error" &&
    bookResults.length === 0 &&
    searchMessage === t("search.noResultsLong");
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
    let cancelled = false;

    void enrichMissingBookCovers(editorPicks).then((enrichedPicks) => {
      if (!cancelled) setResolvedEditorPicks(enrichedPicks);
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
      setRecentFinishesError(t("search.recentUnavailable"));
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
      setSearchMessage(t("search.enterQuery"));
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
          t("search.noResultsLong"));
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
      setSearchMessage(error.message || t("search.unavailable"));
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
          setRecentFinishesError(t("search.recentUnavailable"));
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
  }, [t]);


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
    setSearchMessage(t("search.sessionLoading"));
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

	    setSearchMessage(t(
        targetShelf === "read"
          ? "search.addedToRead"
          : targetShelf === "currently-reading"
            ? "search.addedToCurrent"
            : "search.addedToTbr",
        { title: book.title },
      ));

      if (targetShelf === "read") {
        await refreshRecentFinishes();
        setReviewBook({
          ...book,
          bookId: savedLibraryBook.book.id,
          coverUrl: getPreferredGoogleBooksCoverUrl(
            book.coverUrl || savedLibraryBook.book.cover_url,
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
	    setSearchMessage(t("search.addedWithReview", { title: reviewBook.title }));
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
    description: book.description || t("books.loadingDescription"),
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
    setSubmissionError(t("search.enterTitle"));
    return;
  }

  if (!author) {
    setSubmissionError(t("search.enterAuthor"));
    return;
  }

  if (!language) {
    setSubmissionError(t("search.chooseLanguage"));
    return;
  }

  if (!coverUrl) {
    setSubmissionError(t("search.enterCover"));
    return;
  }

  if (!isHttpUrl(coverUrl)) {
    setSubmissionError(t("search.invalidCover"));
    return;
  }

  if (!publicationYearText) {
    setSubmissionError(t("search.enterYear"));
    return;
  }

  const publicationYear = Number(publicationYearText);
  const currentYear = new Date().getFullYear();

  if (
    !Number.isInteger(publicationYear) ||
    publicationYear < 1 ||
    publicationYear > currentYear
  ) {
    setSubmissionError(t("search.invalidYear"));
    return;
  }

  if (!description) {
    setSubmissionError(t("search.enterDescription"));
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
      t("search.submitted"),
    );
    setSubmissionDraft(initialSubmissionDraft);
    setIsSubmissionOpen(false);
  } catch (error) {
    console.error("Failed to submit book:", error);
    setSubmissionError(
      error.message || t("search.submitFailed"),
    );
  } finally {
    setSubmissionSaving(false);
  }
}

  return (
    <section className="home-page discover-page" aria-label={t("search.discoverBooks")}>
      <header className="discover-search-hero" ref={searchHeroRef}>
        <div className="discover-page-title">
          <p className="eyebrow">{t("search.eyebrow")}</p>
          <h1>{t("search.heading")}</h1>
          <p className="school-motto">{t("search.motto")}</p>
        </div>
        <form className="discovery-search-bar" onSubmit={searchBooks}>
          <label className="sr-only" htmlFor="book-search">{t("search.fieldLabel")}</label>
          <input
            id="book-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
          />
          <button type="submit" disabled={searchStatus === "loading"}>
            {searchStatus === "loading" ? t("common.searching") : t("common.search")}
          </button>
        </form>
        <section className="recent-finishes" aria-labelledby="recent-finishes-title">
          <div className="recent-finishes-heading">
            <div>
              <p className="eyebrow">{t("search.aroundRoom")}</p>
              <h2 id="recent-finishes-title">{t("search.recent")}</h2>
            </div>
            <span>{t("search.anonymous")}</span>
          </div>

          {recentFinishesLoading ? (
            <p className="recent-finishes-status">{t("search.loadingRecent")}</p>
          ) : recentFinishesError ? (
            <p className="recent-finishes-status" role="alert">{recentFinishesError}</p>
          ) : recentFinishes.length === 0 ? (
            <p className="recent-finishes-status">{t("search.noRecent")}</p>
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
                      ? t("search.viewFinished", { title: book.title })
                      : t("search.viewRated", { title: book.title, rating: book.rating })
                  }
                >
                  <div className="recent-finish-cover" aria-hidden="true">
                    <BookCoverImage
                      src={book.coverUrl}
                      alt=""
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <strong>{book.title}</strong>
                    <small>{book.author}</small>
                    {book.rating == null ? (
                      <span className="recent-finish-rating">{t("search.finished")}</span>
                    ) : (
                      <span
                        className="recent-finish-rating"
                        aria-label={t("rating.outOf", { rating: book.rating.toFixed(1) })}
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
            <div className="book-search-results" aria-label={t("search.results")}>
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
                          aria-label={t("search.viewDetails", { title: book.title })}
                        >
                          <div className="isbn-result-cover">
                            <BookCoverImage
                              src={book.coverUrl}
                              alt={t("books.coverAlt", { title: book.title })}
                              decorative
                            />
                          </div>
                          <div>
                            <p className="eyebrow">
                              {getBookSourceLabel(book)}
                            </p>
                            <h2>{book.title}</h2>
                            <p className="isbn-result-author">{book.author}</p>
                            {book.firstPublished ? <small>{t("books.firstPublished", { year: book.firstPublished })}</small> : null}
                            {book.isbn ? <small>ISBN {book.isbn}</small> : null}
                          </div>
                        </button>
	                      <BookModerationStatus book={book} onRetry={retryBookModeration} />
	                      <div className="isbn-result-actions">
                          <label className="isbn-shelf-choice">
                            <span>{t("search.addTo")}</span>
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
                              <option value="to-be-read">{t("search.toBeRead")}</option>
                              <option value="currently-reading">{t("books.currentlyReading")}</option>
                              <option value="read">{t("search.read")}</option>
                            </select>
                          </label>
		                      <button
	                        className="primary-button"
	                        type="button"
                          disabled={isSaved || isSaving || !isModerationApproved}
                          onClick={() => addToReadingList(book)}
                        >
                          {isSaving
                            ? t("books.adding")
                            : isSaved
                              ? t("search.addedReadingList")
                              : book.moderationStatus === "checking"
                                ? t("search.addChecking")
                                : t("books.addToMyShelf")}
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
          <span>{t("search.stillMissing")}</span>
          <button className="primary-button" type="button" onClick={openSubmissionForm}>
            {t("search.submitReview")}
          </button>
        </div>
      ) : null}

      <div className="discovery-layout">
        <main className="discovery-main">
          <section className="discovery-editor-picks" aria-label={t("search.monthlyPicks")}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("search.seasonalShelf")}</p>
                <h2>{t("search.monthlyPicks")}</h2>
              </div>
            </div>
            <div className="discovery-pick-showcase">
              <button
                className={`discovery-featured-pick ${featuredPick.tone}`}
                type="button"
                onClick={() => openBookDetails(featuredPick)}
                aria-label={t("search.viewDetails", { title: featuredPick.title })}
              >
                <EditorPickCover book={featuredPick} featured />
                <div>
                  <p>{t("search.recommendedEditors")}</p>
                  <h3>{featuredPick.title}</h3>
                  <blockquote>{featuredPick.blurb}</blockquote>
                  <span className="editor-pick-cta">{t("search.readMore")}</span>
                </div>
              </button>

              <div className="discovery-pick-grid">
                {supportingPicks.map((book) => (
                  <button
                    className={`discovery-pick-card ${book.tone}`}
                    type="button"
                    key={book.title}
                    onClick={() => openBookDetails(book)}
                    aria-label={t("search.viewDetails", { title: book.title })}
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
              <section className="themed-lists-section" aria-label={t("search.studentPosts")}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">{t("search.studentEssays")}</p>
                    <h2>{t("search.recommendationPosts")}</h2>
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
                        {list.username ? <em>{t("search.by", { name: list.username })}</em> : null}
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
              aria-label={t("search.closeSubmission")}
              onClick={closeSubmissionForm}
              disabled={submissionSaving}
            >
              ×
            </button>
            <h2>{t("books.submitBook")}</h2>
            <form onSubmit={submitMissingBook}>
              <label>
                <span>{t("books.title")} *</span>
                <input
                  type="text"
                  value={submissionDraft.title}
                  onChange={(event) => updateSubmissionDraft("title", event.target.value)}
                  disabled={submissionSaving}
                  required
                />
              </label>
              <label>
                <span>{t("books.author")} *</span>
                <input
                  type="text"
                  value={submissionDraft.author}
                  onChange={(event) => updateSubmissionDraft("author", event.target.value)}
                  disabled={submissionSaving}
                  required
                />
              </label>
              <label>
                <span>{t("books.language")} *</span>
                <select
                  value={submissionDraft.language}
                  onChange={(event) => updateSubmissionDraft("language", event.target.value)}
                  disabled={submissionSaving}
                  required
                >
                  <option value="en">{t("search.english")}</option>
                  <option value="zh">{t("search.chinese")}</option>
                  <option value="other">{t("search.other")}</option>
                </select>
              </label>
              <label>
                <span>{t("books.isbn")}</span>
                <input
                  type="text"
                  value={submissionDraft.isbn}
                  onChange={(event) => updateSubmissionDraft("isbn", event.target.value)}
                  disabled={submissionSaving}
                />
              </label>
              <label>
                <span>{t("books.publisher")}</span>
                <input
                  type="text"
                  value={submissionDraft.publisher}
                  onChange={(event) => updateSubmissionDraft("publisher", event.target.value)}
                  disabled={submissionSaving}
                />
              </label>
              <label>
                <span>{t("search.publicationYear")} *</span>
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
                <span>{t("search.coverUrl")} *</span>
                <input
                  type="url"
                  value={submissionDraft.coverUrl}
                  onChange={(event) => updateSubmissionDraft("coverUrl", event.target.value)}
                  disabled={submissionSaving}
                  required
                />
                <small className="submit-book-field-help">
                  {t("search.coverHelp")}
                </small>
              </label>
              <label>
                <span>{t("books.description")} *</span>
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
                {submissionSaving ? t("common.submitting") : t("search.submitForReview")}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Discover;
