import { useEffect, useState } from "react";
import { bookDatabasePreview } from "../data/books";
import { useRequireLogin } from "../hooks/useRequireLogin";
import {useAuth} from "../hooks/useAuth";
import { getUserLibrary } from "../lib/libraryApi";
import { createPost, getFeedPosts } from "../lib/postApi";

const STORAGE_KEY = "litshelf-home-state-v1";
const PROFILE_REVIEWS_KEY = "litshelf-profile-reviews-v1";
const defaultTrackedBook = {
  title: "Bluets",
  author: "Maggie Nelson",
  isbn: "9781933517407",
  pagesRead: 38,
  totalPages: 112,
  finished: false,
};

function getCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

function saveProfileReview(review) {
  try {
    const savedReviews = JSON.parse(localStorage.getItem(PROFILE_REVIEWS_KEY));
    const reviews = Array.isArray(savedReviews) ? savedReviews : [];
    localStorage.setItem(PROFILE_REVIEWS_KEY, JSON.stringify([review, ...reviews]));
  } catch {
    localStorage.setItem(PROFILE_REVIEWS_KEY, JSON.stringify([review]));
  }
}

function getInitialHomeState() {
  const fallback = {
    trackedBook: defaultTrackedBook,
  };

  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!savedState) {
      return fallback;
    }

    return {
      trackedBook: savedState.trackedBook || fallback.trackedBook,
    };
  } catch {
    return fallback;
  }
}

const shelfLinks = [
  {
    label: "Reading",
    count: 4,
    tone: "sea",
    note: "books open right now",
  },
  {
    label: "Want to Read",
    count: 18,
    tone: "forest",
    note: "saved for later",
  },
  {
    label: "To Read",
    count: 9,
    tone: "terracotta",
    note: "queued this month",
  },
];

const gradeLeaderboard = [
  { grade: "12th Grade", books: 314, accent: "navy" },
  { grade: "11th Grade", books: 287, accent: "forest" },
  { grade: "10th Grade", books: 242, accent: "terracotta" },
  { grade: "9th Grade", books: 218, accent: "sea" },
];

function Home() {
  const [initialHomeState] = useState(getInitialHomeState);
  const { requireLogin, isLoggedIn } = useRequireLogin();
  const { user } = useAuth();

  const [posts, setPosts] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  const [trackedBook, setTrackedBook] = useState(
    initialHomeState.trackedBook,
  );

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isLogBookOpen, setIsLogBookOpen] = useState(false);
  const [isFinishReviewOpen, setIsFinishReviewOpen] = useState(false);
  const [readingDraft, setReadingDraft] = useState({
    bookTitle: initialHomeState.trackedBooks?.[0]?.title || bookDatabasePreview[0].title,
    totalPages: initialHomeState.trackedBooks?.[0]?.totalPages || bookDatabasePreview[0].pages || 1,
  });
  const [finishReview, setFinishReview] = useState({
    rating: 5,
    review: "",
    visibility: "public",
  });
  const [finishReviewSaving, setFinishReviewSaving] = useState(false);
  const [finishReviewError, setFinishReviewError] = useState("");
  const [composeDraft, setComposeDraft] = useState({
    bookId: "",
    note: "",
  });
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");

  const [publishingNote, setPublishingNote] = useState(false);
  const [publishNoteError, setPublishNoteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      setFeedLoading(true);
      setFeedError("");

      try {
        const loadedPosts = await getFeedPosts(user?.id || null);

        if (!cancelled) {
          setPosts(loadedPosts);
        }
      } catch (error) {
        console.error("Failed to load reading feed:", error);

        if (!cancelled) {
          setFeedError(
            error.message || "Could not load the reading feed.",
          );
        }
      } finally {
        if (!cancelled) {
          setFeedLoading(false);
        }
      }
    }

    loadFeed();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadLibraryBooks() {
      if (!user?.id) {
        setLibraryBooks([]);
        setLibraryLoading(false);
        return;
      }

      setLibraryLoading(true);
      setLibraryError("");

      try {
        const books = await getUserLibrary(user.id);

        if (!cancelled) {
          setLibraryBooks(books);

          setComposeDraft((currentDraft) => ({
            ...currentDraft,
            bookId:
              currentDraft.bookId ||
              String(books[0]?.bookId || ""),
          }));
        }
      } catch (error) {
        console.error("Failed to load books for composer:", error);

        if (!cancelled) {
          setLibraryError(
            error.message || "Could not load your books.",
          );
        }
      } finally {
        if (!cancelled) {
          setLibraryLoading(false);
        }
      }
    }

    loadLibraryBooks();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trackedBook,
      }),
    );
  }, [trackedBook]);

  function toggleLike(postId) {
  if (!requireLogin()) return;
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked: !post.liked,
              likes: post.liked ? post.likes - 1 : post.likes + 1,
            }
          : post,
      ),
    );
  }

  function updateDraft(postId, value) {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId ? { ...post, draftComment: value } : post,
      ),
    );
  }

  function addComment(postId) {
    if (!requireLogin()) return;
    setPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId || !post.draftComment.trim()) {
          return post;
        }

        return {
          ...post,
	          comments: [
                ...post.comments,
                {
                  id: crypto.randomUUID(),
                  name: userHandle,
                  text: post.draftComment.trim(),
                  createdAt: new Date().toISOString(),
                },
              ],
	          draftComment: "",
	        };
      }),
    );
  }

  function openComposer(bookId = null) {
    if (!requireLogin()) return;

    setPublishNoteError("");

    setComposeDraft((currentDraft) => ({
      ...currentDraft,
      bookId: String(
        bookId ||
        currentDraft.bookId ||
        libraryBooks[0]?.bookId ||
        "",
      ),
    }));

    setIsComposerOpen(true);
  }

  function closeComposer() {
    setIsComposerOpen(false);
  }

  async function logCurrentBook(event) {
    event.preventDefault();
    if (!requireLogin()) return;
    if (!user?.id) return;

    const selectedBook =
      bookDatabasePreview.find((book) => book.title === readingDraft.bookTitle) ||
      bookDatabasePreview[0];

    const nextTrackedBook = {
      title: selectedBook.title,
      author: selectedBook.author,
      isbn: selectedBook.isbn,
      pagesRead: 0,
      totalPages: Number(readingDraft.totalPages) || 1,
      finished: false,
      coverUrl: getCoverUrl(selectedBook.isbn),
    };

    try {
      const savedLibraryBook = await addBookToLibrary(
        user.id,
        {
          title: selectedBook.title,
          author: selectedBook.author,
          isbn: selectedBook.isbn,
          coverUrl: getCoverUrl(selectedBook.isbn),
        },
        "currently-reading",
      );

      const savedTrackedBook = {
        ...nextTrackedBook,
        shelfEntryId: savedLibraryBook.shelf.id,
        bookId: savedLibraryBook.book.id,
      };

      setTrackedBooks((currentBooks) => [
        savedTrackedBook,
        ...currentBooks.filter(
          (book) => getTrackedBookKey(book) !== getTrackedBookKey(savedTrackedBook),
        ),
      ]);
    } catch (error) {
      console.error("Failed to save current reading book:", error);
      setTrackedBooks((currentBooks) => [
        nextTrackedBook,
        ...currentBooks.filter((book) => book.isbn !== nextTrackedBook.isbn),
      ]);
    }

    setIsLogBookOpen(false);
  }

  function updateTrackedPages(bookToUpdate, value) {
    if (!requireLogin()) return;
    if (!bookToUpdate) return;

    const nextPages = Math.max(0, Math.min(Number(value) || 0, bookToUpdate.totalPages));
    const shouldFinish = nextPages >= bookToUpdate.totalPages;
    const bookKey = getTrackedBookKey(bookToUpdate);
    const updatedBook = {
      ...bookToUpdate,
      pagesRead: nextPages,
      finished: shouldFinish,
    };

    setTrackedBooks((currentBooks) =>
      currentBooks.map((book) =>
        getTrackedBookKey(book) === bookKey ? updatedBook : book,
      ),
    );

    if (shouldFinish && !bookToUpdate.finished) {
      setFinishingBook(updatedBook);
      setFinishReviewError("");
      setIsFinishReviewOpen(true);
    }
  }

  function finishTrackedBook(bookToFinish) {
    if (!requireLogin()) return;
    if (!bookToFinish) return;
    const bookKey = getTrackedBookKey(bookToFinish);
    const finishedBook = {
      ...bookToFinish,
      pagesRead: bookToFinish.totalPages,
      finished: true,
    };

    setTrackedBooks((currentBooks) =>
      currentBooks.map((book) =>
        getTrackedBookKey(book) === bookKey ? finishedBook : book,
      ),
    );
    setFinishingBook(finishedBook);
    setFinishReviewError("");
    setIsFinishReviewOpen(true);
  }

  function closeFinishReview() {
    if (finishingBook) {
      const bookKey = getTrackedBookKey(finishingBook);

      setTrackedBooks((currentBooks) =>
        currentBooks.map((book) =>
          getTrackedBookKey(book) === bookKey
            ? { ...book, finished: false }
            : book,
        ),
      );
    }

    setFinishingBook(null);
    setFinishReviewError("");
    setIsFinishReviewOpen(false);
  }

  async function submitFinishReview(event) {
    event.preventDefault();
    if (!requireLogin()) return;
    if (!finishingBook) return;
    if (!user?.id) {
      setFinishReviewError("Your login session is still loading. Please try again.");
      return;
    }

    setFinishReviewSaving(true);
    setFinishReviewError("");

    const savedReview = {
      book: finishingBook.title,
      author: finishingBook.author,
      isbn: finishingBook.isbn,
      rating: Number(finishReview.rating),
      note: finishReview.review.trim() || "Finished without a written review.",
      visibility: finishReview.visibility,
    };

    try {
      const savedLibraryBook = await addBookToLibrary(
        user.id,
        {
          title: finishingBook.title,
          author: finishingBook.author,
          isbn: finishingBook.isbn,
          coverUrl: finishingBook.coverUrl || getCoverUrl(finishingBook.isbn),
        },
        "read",
      );

      await saveReview({
        userId: user.id,
        bookId: savedLibraryBook.book.id,
        rating: finishReview.rating,
        reviewText: finishReview.review,
      });

      saveProfileReview(savedReview);
    } catch (error) {
      console.error("Failed to save finished book:", error);
      setFinishReviewError(error.message || "Could not save this finished book.");
      setFinishReviewSaving(false);
      return;
    }

    if (finishReview.visibility === "public") {
      setPosts((currentPosts) => [
        createPublicReviewPost({
          book: finishingBook,
          rating: finishReview.rating,
          reviewText: finishReview.review,
          user,
          profile,
        }),
        ...currentPosts,
      ]);
    }

    setFinishReview({ rating: 5, review: "", visibility: "public" });
    setTrackedBooks((currentBooks) =>
      currentBooks.filter(
        (book) => getTrackedBookKey(book) !== getTrackedBookKey(finishingBook),
      ),
    );
    setFinishingBook(null);
    setFinishReviewSaving(false);
    setIsFinishReviewOpen(false);
  }

  function renderRatingPicker() {
    return (
      <div className="star-rating-picker" role="group" aria-label="Choose rating">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill =
            Number(finishReview.rating) >= star
              ? "100%"
              : Number(finishReview.rating) >= star - 0.5
                ? "50%"
                : "0%";

          return (
            <span className="rating-star-control" key={star}>
              <span className="rating-star-base">★</span>
              <span className="rating-star-fill" style={{ width: fill }}>★</span>
              <button
                type="button"
                aria-label={`${star - 0.5} stars`}
                onClick={() =>
                  setFinishReview((draft) => ({ ...draft, rating: star - 0.5 }))
                }
              />
              <button
                type="button"
                aria-label={`${star} stars`}
                onClick={() => setFinishReview((draft) => ({ ...draft, rating: star }))}
              />
            </span>
          );
        })}
        <strong>{Number(finishReview.rating).toFixed(1)}</strong>
      </div>
    );
  }

  async function publishNote(event) {
    event.preventDefault();

    if (!requireLogin()) return;

    if (!user?.id) {
      setPublishNoteError("You must be logged in to publish.");
      return;
    }

    const note = composeDraft.note.trim();
    const selectedBook = libraryBooks.find(
      (book) => String(book.bookId) === String(composeDraft.bookId),
    );

    if (!selectedBook) {
      setPublishNoteError("Please choose a book.");
      return;
    }

    if (!note) {
      setPublishNoteError("Please write a note before publishing.");
      return;
    }

    setPublishingNote(true);
    setPublishNoteError("");

    try {
      const createdPost = await createPost({
        userId: user.id,
        bookId: selectedBook.bookId,
        note,
        postType: "note",
        progress: selectedBook.progress ?? 0,
        rating: 0,
      });

      setPosts((currentPosts) => [
        createdPost,
        ...currentPosts,
      ]);

      setComposeDraft({
        bookId: String(selectedBook.bookId),
        note: "",
      });

      setIsComposerOpen(false);
    } catch (error) {
      console.error("Failed to publish reading note:", error);

      setPublishNoteError(
        error.message || "Could not publish your note.",
      );
    } finally {
      setPublishingNote(false);
    }
  }

  return (
    <div className="home-page">
      <section className="reading-room-hero" aria-labelledby="home-title">
        <div>
	          <p className="eyebrow">Your reading room</p>
          <div className="hero-title-lockup">
            <span className="hero-seal" aria-hidden="true">L</span>
            <div>
              <h1 id="home-title">What are you reading today?</h1>
              <p>LitShelf | The Reading Room</p>
            </div>
          </div>
          <p className="hero-copy">
            Start by logging your currently reading books to cultivate a reading
            community at Tsinglan.
          </p>
          <button className="primary-button hero-action" type="button" onClick={() => openComposer()}>
            Share your reading
          </button>
        </div>
      </section>

      <section className="grade-leaderboard-strip" aria-label="Reading grade leaderboard">
        <div className="leaderboard-strip-heading">
          <p className="eyebrow">Grade leaderboard</p>
          <strong>Books read this month</strong>
        </div>
        <p className="leaderboard-empty">
          Grade totals will appear here once reading activity is connected.
        </p>
      </section>

	      <div className="home-grid">
	        <aside className="shelf-rail" aria-label="Your reading shelves">
	          {isLoggedIn ? (
	            <>
	              <section className="current-book-card" aria-label="Currently reading tracker">
                <div className="section-heading compact">
              <div>
                <p className="eyebrow">Currently Reading</p>
                <h2>Reading Tracker</h2>
              </div>
            </div>
            {trackedBooks.length > 0 ? (
              <div className="tracked-books-list">
                {trackedBooks.map((book) => (
                  <article className="tracked-book-entry" key={getTrackedBookKey(book)}>
                    <div className="tracked-book-card home-tracked-book">
                      <img src={book.coverUrl || getCoverUrl(book.isbn)} alt="" loading="lazy" />
                      <div>
                        <p>{book.author}</p>
                        <strong>{book.title}</strong>
                        <small>
                          {book.pagesRead} / {book.totalPages} pages
                        </small>
                      </div>
                    </div>
                    <div className="progress-editor compact">
                      <label>
                        <span>Pages read</span>
                        <input
                          type="number"
                          min="0"
                          max={book.totalPages}
                          value={book.pagesRead}
                          onChange={(event) => updateTrackedPages(book, event.target.value)}
                        />
                      </label>
                      <div>
                        <span>{Math.round((book.pagesRead / book.totalPages) * 100)}%</span>
                        <strong>{book.finished ? "Finished" : "In progress"}</strong>
                      </div>
                    </div>
                    <button
                      className="tracker-finish-inline"
                      type="button"
                      onClick={() => finishTrackedBook(book)}
                    >
                      Finish
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="profile-empty">
                Nothing is being tracked right now. Log your next book when you start reading.
              </p>
            )}
            <div className="tracker-actions">
              <button
                type="button"
                onClick={() => {
                  if (!requireLogin()) return;
                  setIsLogBookOpen(true);
	                }}
	              >
	                Log Book
	              </button>
	            </div>
              </section>

	            </>
          ) : (
            <section className="signin-rail-card">
              <p className="eyebrow">Your private shelf</p>
              <h2>Sign in to track your reading.</h2>
              <p>
                Your books, page progress, shelves, ratings, and private reviews
                live inside your account.
              </p>
              <button type="button" onClick={requireLogin}>
                Sign in to log books
              </button>
            </section>
          )}
        </aside>

        <section className="feed-column" aria-label="Social feed">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Current Readers</p>
              <h2>Reading Notes</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => openComposer()}
            >
              Write Note
            </button>
          </div>

          <div className="feed-list">
          {feedLoading ? (
            <p className="profile-empty">Loading reading notes...</p>
          ) : feedError ? (
            <p className="profile-save-error" role="alert">
              {feedError}
            </p>
          ) : posts.length === 0 ? (
            <p className="profile-empty">
              No reading notes have been published yet.
            </p>
          ) : (
            posts.map((post) => (
              <article className="feed-card sea" key={post.id}>
                <header className="feed-card-header">
                  <div className="avatar-stack">
                    <div className="avatar" aria-hidden="true">
                      {post.student
                        .split(" ")
                        .filter(Boolean)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <span className="activity-dot" aria-hidden="true" />
                  </div>

                  <div>
                    <p className="feed-title">
                      <strong>{post.student}</strong>{" "}
                      {post.action}{" "}
                      <span>{post.book}</span>
                    </p>

                    <p className="feed-meta">
                      {post.username
                        ? `@${post.username.replace(/^@/, "")} | `
                        : ""}
                      {post.time}
                    </p>
                  </div>
                </header>

                <div className="feed-note-bubble">
                  <p>{post.note}</p>
                </div>

                <div className="book-strip">
                  <div className="book-cover" aria-hidden="true">
                    {post.coverUrl ? (
                      <img
                        src={post.coverUrl}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span>{post.book}</span>
                    )}
                  </div>

                  <div className="book-details">
                    <p>{post.genre}</p>
                    <strong>{post.author}</strong>

                    <small>
                      {post.progress}% through the book
                    </small>

                    <div
                      className="bookmark-progress"
                      aria-label={`${post.progress}% complete`}
                    >
                      <span
                        style={{
                          width: `${Math.min(
                            Math.max(post.progress, 0),
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    className="rating"
                    aria-label={
                      post.rating > 0
                        ? `${post.rating} out of 5`
                        : "No rating"
                    }
                  >
                    {post.rating > 0
                      ? `${post.rating} / 5`
                      : post.postType === "finished"
                        ? "Finished"
                        : "In progress"}
                  </div>
                </div>

                <div className="feed-actions">
                  <button
                    className={
                      post.liked
                        ? "feed-action active"
                        : "feed-action"
                    }
                    type="button"
                    onClick={() => toggleLike(post.id)}
                    aria-label={
                      post.liked ? "Unlike post" : "Like post"
                    }
                  >
                    <span aria-hidden="true">
                      {post.liked ? "♥" : "♡"}
                    </span>
                    <small>{post.likes}</small>
                  </button>

                  <button
                    className="feed-action"
                    type="button"
                    aria-label="Comment on post"
                  >
                    <span aria-hidden="true">↩</span>
                    <small>{post.comments.length}</small>
                  </button>
                </div>

                <div className="comment-list">
                  {post.comments.slice(-2).map((comment) => (
                    <p key={comment.id}>
                      <strong>{comment.commenterName}</strong>{" "}
                      {comment.text}
                    </p>
                  ))}
                </div>

                <div className="comment-form">
                  <input
                    type="text"
                    value={post.draftComment}
                    onChange={(event) =>
                      updateDraft(post.id, event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addComment(post.id);
                      }
                    }}
                    placeholder="Add a quiet thought..."
                    aria-label={`Comment on ${post.book}`}
                  />

                  <button
                    type="button"
                    onClick={() => addComment(post.id)}
                  >
                    Send
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        </section>

      </div>

      {isComposerOpen && (
        <div
          className="composer-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeComposer();
            }
          }}
        >
          <section
            className="composer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={closeComposer}
              aria-label="Close composer"
            >
              x
            </button>
            <p className="eyebrow">Publish to the feed</p>
            <h2 id="composer-title">Add a reading note</h2>
            <form onSubmit={publishNote}>
              <label>
                <span>Book</span>
                {libraryLoading ? (
                  <p>Loading your books...</p>
                ) : libraryError ? (
                  <p className="profile-save-error">
                    {libraryError}
                  </p>
                ) : libraryBooks.length === 0 ? (
                  <p className="profile-empty">
                    Add a book from Discover before writing a reading note.
                  </p>
                ) : (
                  <select
                    value={composeDraft.bookId}
                    disabled={publishingNote}
                    onChange={(event) =>
                      setComposeDraft((draft) => ({
                        ...draft,
                        bookId: event.target.value,
                      }))
                    }
                  >
                    {libraryBooks.map((book) => (
                      <option
                        value={String(book.bookId)}
                        key={book.shelfEntryId}
                      >
                        {book.title} - {book.author}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                <span>Your note or quote</span>
                <textarea
                  value={composeDraft.note}
                  onChange={(event) =>
                    setComposeDraft((draft) => ({
                      ...draft,
                      note: event.target.value,
                    }))
                  }
                  placeholder="What line, thought, or review do you want to share?"
                  rows="6"
                />
              </label>
                <div className="modal-preview">
                  <div className="tracked-cover" aria-hidden="true">
                    <span>
                      {libraryBooks.find(
                        (book) =>
                          String(book.bookId) === String(composeDraft.bookId),
                      )?.title || "Choose a book"}
                    </span>
                  </div>

                  <p>
                    This will appear in the social feed as your newest note.
                  </p>
                </div>
              <button className="primary-button full" type="submit">
                Publish note
              </button>
            </form>
          </section>
        </div>
      )}

      {isLogBookOpen && (
        <div className="composer-modal-backdrop" role="presentation">
          <section className="composer-modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              type="button"
              onClick={() => setIsLogBookOpen(false)}
              aria-label="Close book logger"
            >
              x
            </button>
            <p className="eyebrow">Currently Reading</p>
            <h2>Log a book</h2>
            <form onSubmit={logCurrentBook}>
              <label>
                <span>Book</span>
                <select
                  value={readingDraft.bookTitle}
                  onChange={(event) =>
                    setReadingDraft((draft) => ({ ...draft, bookTitle: event.target.value }))
                  }
                >
                  {bookDatabasePreview.map((book) => (
                    <option value={book.title} key={book.isbn}>
                      {book.title} - {book.author}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Total pages</span>
                <input
                  type="number"
                  min="1"
                  value={readingDraft.totalPages}
                  onChange={(event) =>
                    setReadingDraft((draft) => ({ ...draft, totalPages: event.target.value }))
                  }
                />
              </label>
              <button className="primary-button full" type="submit">
                Start Tracking
              </button>
            </form>
          </section>
        </div>
      )}

      {isFinishReviewOpen && (
        <div className="composer-modal-backdrop" role="presentation">
          <section className="composer-modal" role="dialog" aria-modal="true">
	            <button
	              className="modal-close"
	              type="button"
	              onClick={closeFinishReview}
	              aria-label="Close review popup"
	            >
              x
            </button>
            <p className="eyebrow">Finished Shelf</p>
            <h2>Rate & review?</h2>
            <form onSubmit={submitFinishReview}>
              <label>
                <span>Rating</span>
                {renderRatingPicker()}
              </label>
              <label>
                <span>Review</span>
                <textarea
                  rows="5"
                  value={finishReview.review}
                  onChange={(event) =>
                    setFinishReview((draft) => ({ ...draft, review: event.target.value }))
                  }
                  placeholder="Write a review if you want to save or share one."
                />
              </label>
              <label>
                <span>Visibility</span>
                <select
                  value={finishReview.visibility}
                  onChange={(event) =>
                    setFinishReview((draft) => ({ ...draft, visibility: event.target.value }))
                  }
                >
                  <option value="public">Public - post to feed</option>
                  <option value="private">Private - save to my profile only</option>
                </select>
              </label>
              {finishReviewError ? (
                <p className="profile-save-error" role="alert">{finishReviewError}</p>
              ) : null}
              <button className="primary-button full" type="submit" disabled={finishReviewSaving}>
                {finishReviewSaving ? "Saving..." : "Save Review"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default Home;
