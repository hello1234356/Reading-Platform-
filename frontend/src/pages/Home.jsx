import { useEffect, useState } from "react";
import { bookDatabasePreview } from "../data/books";
import { useRequireLogin } from "../hooks/useRequireLogin";
import { useAuth } from "../hooks/useAuth";
import { addBookToLibrary, getUserLibrary } from "../lib/libraryApi";
import { createPost, getFeedPosts, addPostComment, likePost, unlikePost,} from "../lib/postApi";
import { getUserProfile } from "../lib/profileApi";
import { saveReview } from "../lib/reviewApi";
import { getUserDisplayHandle } from "../lib/socialFeed";
import BookDetailModal from "../components/BookDetailModal";
import { getOpenLibraryBookDetails } from "../lib/openLibrary";

const STORAGE_KEY = "litshelf-home-state-v1";
const PROFILE_REVIEWS_KEY = "litshelf-profile-reviews-v1";
const defaultTrackedBook = {
  title: "Bluets",
  author: "Maggie Nelson",
  isbn: "9781933517407",
  progress: 34,
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
function mapLibraryBookToTrackedBook(book) {
  return {
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    coverUrl: book.coverUrl,
    progress: Number(book.progress) || 0,
    finished: false,
    shelfEntryId: book.shelfEntryId,
    bookId: book.bookId,
  };
}

function getTrackedBookKey(book) {
  return book?.shelfEntryId || book?.isbn || book?.title;
}

function normalizeTrackedBook(book) {
  if (Object.prototype.hasOwnProperty.call(book, "progress")) {
    return {
      ...book,
      progress: Math.max(0, Math.min(Number(book.progress) || 0, 100)),
    };
  }

  const legacyProgress = book.totalPages
    ? Math.round(((Number(book.pagesRead) || 0) / Number(book.totalPages)) * 100)
    : 0;

  return { ...book, progress: Math.max(0, Math.min(legacyProgress, 100)) };
}

function getInitialHomeState() {
  const fallback = {
    trackedBooks: [defaultTrackedBook],
  };

  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!savedState) {
      return fallback;
    }

    return {
      trackedBooks: Array.isArray(savedState.trackedBooks)
        ? savedState.trackedBooks.map(normalizeTrackedBook)
        : Object.prototype.hasOwnProperty.call(savedState, "trackedBook")
          ? savedState.trackedBook
            ? [normalizeTrackedBook(savedState.trackedBook)]
            : []
          : fallback.trackedBooks,
    };
  } catch {
    return fallback;
  }
}

function Home() {
  const [initialHomeState] = useState(getInitialHomeState);
  const { requireLogin, isLoggedIn } = useRequireLogin();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const userHandle = getUserDisplayHandle(user, profile);
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookDetailLoading, setBookDetailLoading] = useState(false);
  const [bookDetailError, setBookDetailError] = useState(""); 
  const [modalShelf, setModalShelf] = useState("to-be-read");
  const [addingBook, setAddingBook] = useState(false);
  const [bookAdded, setBookAdded] = useState(false);
  const [posts, setPosts] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  const [trackedBooks, setTrackedBooks] = useState(initialHomeState.trackedBooks);
  const [finishingBook, setFinishingBook] = useState(null);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isLogBookOpen, setIsLogBookOpen] = useState(false);
  const [isFinishReviewOpen, setIsFinishReviewOpen] = useState(false);
  const [readingDraft, setReadingDraft] = useState({
    bookTitle: initialHomeState.trackedBooks?.[0]?.title || bookDatabasePreview[0].title,
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
    async function loadProfile() {
      if (!user?.id) {
        setProfile(null);
        return;
      }

      try {
        setProfile(await getUserProfile(user.id));
      } catch (error) {
        console.error("Failed to load reading room profile:", error);
      }
    }

    loadProfile();
  }, [user?.id]);

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
          setTrackedBooks(
            books
              .filter((book) => book.shelf === "currently-reading")
              .map(mapLibraryBookToTrackedBook),
          );

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
        trackedBooks,
      }),
    );
  }, [trackedBooks]);

  async function toggleLike(postId) {
    if (!requireLogin()) return;
    if (!user?.id) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      if (post.liked) {
        await unlikePost({
          postId,
          userId: user.id,
        });
      } else {
        await likePost({
          postId,
          userId: user.id,
        });
      }

      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id !== postId
            ? currentPost
            : {
                ...currentPost,
                liked: !currentPost.liked,
                likes:
                  currentPost.likes + (currentPost.liked ? -1 : 1),
              },
        ),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function updateDraft(postId, value) {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId ? { ...post, draftComment: value } : post,
      ),
    );
  }
  async function openBookDetails(book) {
    setModalShelf("to-be-read");
    setBookAdded(false);
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
  async function addComment(postId) {
    if (!requireLogin()) return;
    if (!user?.id) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const comment = post.draftComment.trim();

    if (!comment) return;

    try {
      const createdComment = await addPostComment({
        postId,
        userId: user.id,
        comment,
      });

      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id !== postId
            ? currentPost
            : {
                ...currentPost,
                comments: [...currentPost.comments, createdComment],
                draftComment: "",
              },
        ),
      );
    } catch (error) {
      console.error(error);
    }
  }

  function openComposer(bookId = null) {
    if (!requireLogin()) return;

    setPublishNoteError("");

    setComposeDraft((currentDraft) => ({
      ...currentDraft,
      bookId: bookId
        ? String(bookId)
        : currentDraft.bookId || "",
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
      progress: 0,
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

  function updateTrackedProgress(bookToUpdate, value) {
    if (!requireLogin()) return;
    if (!bookToUpdate) return;

    const nextProgress = Math.max(0, Math.min(Number(value) || 0, 100));
    const shouldFinish = nextProgress >= 100;
    const bookKey = getTrackedBookKey(bookToUpdate);
    const updatedBook = {
      ...bookToUpdate,
      progress: nextProgress,
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
      progress: 100,
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
    let createdFeedPost = null;

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

      if (finishReview.visibility === "public") {
        createdFeedPost = await createPost({
          userId: user.id,
          bookId: savedLibraryBook.book.id,
          note: savedReview.note,
          postType: "review",
          progress: 100,
          rating: finishReview.rating,
        });
      }
    } catch (error) {
      console.error("Failed to save finished book:", error);
      setFinishReviewError(error.message || "Could not save this finished book.");
      setFinishReviewSaving(false);
      return;
    }

    if (createdFeedPost) {
      setPosts((currentPosts) => [createdFeedPost, ...currentPosts]);
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
  async function addModalBookToShelf() {
    if (!requireLogin()) return;
    if (!user?.id || !selectedBook) return;

    setAddingBook(true);

    try {
      await addBookToLibrary(
        user.id,
        selectedBook,
        modalShelf,
      );

      setBookAdded(true);
    } catch (error) {
      console.error(error);
    } finally {
      setAddingBook(false);
    }
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
    ) ?? null;

    if (!note) {
      setPublishNoteError("Please write a note before publishing.");
      return;
    }

    setPublishingNote(true);
    setPublishNoteError("");

    try {
      const createdPost = await createPost({
        userId: user.id,
        bookId: selectedBook?.bookId ?? null,note,
        postType: "note",
        progress: selectedBook?.progress ?? 0,
        rating: 0,
      });

      setPosts((currentPosts) => [
        createdPost,
        ...currentPosts,
      ]);

      setComposeDraft({
        bookId: "",
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
                        <small>{book.progress}% complete</small>
                      </div>
                    </div>
                    <div className="progress-editor compact">
                      <label>
                        <span>Progress</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={book.progress}
                          onChange={(event) => updateTrackedProgress(book, event.target.value)}
                        />
                      </label>
                      <div>
                        <span>{book.progress}%</span>
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
                      {post.action}
                      {post.hasBook ? (
                        <>
                          {" "}
                          <span>{post.book}</span>
                        </>
                      ) : null}
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
                {post.hasBook && (
                <button
                  type="button"
                  className="book-strip"
                  onClick={() =>
                    openBookDetails({
                      title: post.book,
                      author: post.author,
                      isbn: post.isbn,
                      coverUrl: post.coverUrl,
                    })
                  }
                >                  
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
                      : post.postType === "review"
                        ? "Finished"
                        : "In progress"}
                  </div>
                  </button>
)}
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
              <span>Book — optional</span>

              {libraryLoading ? (
                <p>Loading your books...</p>
              ) : libraryError ? (
                <p className="profile-save-error">
                  {libraryError}
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
                  <option value="">No specific book</option>

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
                      )?.title || "General reading note"}
                    </span>
                  </div>

                  <p>
                    This will appear in the social feed as your newest note.
                  </p>
                </div>
              {publishNoteError ? (
                <p className="profile-save-error" role="alert">
                  {publishNoteError}
                </p>
              ) : null}
              <button
                className="primary-button full"
                type="submit"
                disabled={publishingNote}
              >
                {publishingNote ? "Publishing..." : "Publish note"}
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
      <BookDetailModal
        book={selectedBook}
        loading={bookDetailLoading}
        error={bookDetailError}
        onClose={() => {
          setSelectedBook(null);
          setBookDetailError("");
          setBookDetailLoading(false);
        }}
        footer={
          <>
            <label className="isbn-shelf-choice">
              <span>Add to</span>

              <select
                value={modalShelf}
                onChange={(e) => setModalShelf(e.target.value)}
                disabled={addingBook || bookAdded}
              >
                <option value="to-be-read">To Be Read</option>
                <option value="currently-reading">Currently Reading</option>
                <option value="read">Read</option>
              </select>
            </label>

            <button
              className="primary-button full"
              type="button"
              onClick={addModalBookToShelf}
              disabled={addingBook || bookAdded}
            >
              {addingBook
                ? "Adding..."
                : bookAdded
                  ? "Added to Shelf"
                  : "Add to My Shelf"}
            </button>
          </>
        }
      />
    </div>
  );
}

export default Home;
