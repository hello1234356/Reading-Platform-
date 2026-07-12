import { useEffect, useState } from "react";
import { bookDatabasePreview } from "../data/books";
import { useRequireLogin } from "../hooks/useRequireLogin";

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

const feedItems = [
  {
    id: 1,
    student: "Maya C.",
    year: "CC '27",
    action: "closed the back cover of",
    book: "Normal People",
    author: "Sally Rooney",
    time: "12 min ago",
    mood: "soft ache",
    place: "Hamilton steps",
    accent: "sea",
    note:
      "Read the last thirty pages between classes. The ending felt like overhearing a conversation through a thin apartment wall.",
    rating: 4,
    progress: 100,
    shelf: "Contemporary Fiction",
    likes: 42,
    comments: ["The ending always undoes me.", "Saving this for winter break."],
  },
  {
    id: 2,
    student: "Julian R.",
    year: "GS '26",
    action: "marked a line in",
    book: "Slouching Towards Bethlehem",
    author: "Joan Didion",
    time: "29 min ago",
    mood: "subway weather",
    place: "1 train uptown",
    accent: "terracotta",
    note:
      "A sentence about California that somehow made the 1 train feel cinematic this morning.",
    rating: 5,
    progress: 64,
    shelf: "Essays",
    likes: 31,
    comments: ["Didion before seminar is dangerous.", "Drop the quote at lunch."],
  },
  {
    id: 3,
    student: "Anika S.",
    year: "Barnard '28",
    action: "opened",
    book: "Open City",
    author: "Teju Cole",
    time: "46 min ago",
    mood: "rain walk",
    place: "Butler 301",
    accent: "forest",
    note:
      "Taking this to Butler tonight. The first chapter already reads like walking uptown after rain.",
    rating: 0,
    progress: 12,
    shelf: "New York Novels",
    likes: 18,
    comments: ["Perfect campus book.", "Tell me if it belongs in the circle list."],
  },
  {
    id: 4,
    student: "Theo L.",
    year: "SEAS '25",
    action: "left a review for",
    book: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    time: "1 hr ago",
    mood: "after seminar",
    place: "Philosophy Hall",
    accent: "navy",
    note:
      "More brittle than glamorous this time. The parties feel like weather systems passing over lonely people.",
    rating: 4,
    progress: 100,
    shelf: "American Classics",
    likes: 56,
    comments: ["This is the review.", "Adding it to professor recommendations."],
  },
];

function getInitialHomeState() {
  const fallback = {
    posts: feedItems.map((post) => ({
      ...post,
      liked: false,
      draftComment: "",
    })),
    trackedBook: defaultTrackedBook,
  };

  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!savedState) {
      return fallback;
    }

    return {
      ...fallback,
      ...savedState,
      posts: Array.isArray(savedState.posts) ? savedState.posts : fallback.posts,
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
  const [posts, setPosts] = useState(initialHomeState.posts);
  const [trackedBook, setTrackedBook] = useState(initialHomeState.trackedBook);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isLogBookOpen, setIsLogBookOpen] = useState(false);
  const [isFinishReviewOpen, setIsFinishReviewOpen] = useState(false);
  const [readingDraft, setReadingDraft] = useState({
    bookTitle: initialHomeState.trackedBook.title,
    totalPages: initialHomeState.trackedBook.totalPages,
  });
  const [finishReview, setFinishReview] = useState({
    rating: 5,
    review: "",
    visibility: "public",
  });
  const [composeDraft, setComposeDraft] = useState({
    bookTitle: bookDatabasePreview[0].title,
    note: "",
    tags: "",
  });

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        posts,
        trackedBook,
      }),
    );
  }, [posts, trackedBook]);

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
          comments: [...post.comments, post.draftComment.trim()],
          draftComment: "",
        };
      }),
    );
  }

  function openComposer(bookTitle = composeDraft.bookTitle || bookDatabasePreview[0].title) {
    if (!requireLogin()) return;
    setComposeDraft((draft) => ({ ...draft, bookTitle }));
    setIsComposerOpen(true);
  }

  function closeComposer() {
    setIsComposerOpen(false);
  }

  function logCurrentBook(event) {
    event.preventDefault();
    if (!requireLogin()) return;

    const selectedBook =
      bookDatabasePreview.find((book) => book.title === readingDraft.bookTitle) ||
      bookDatabasePreview[0];

    setTrackedBook({
      title: selectedBook.title,
      author: selectedBook.author,
      isbn: selectedBook.isbn,
      pagesRead: 0,
      totalPages: Number(readingDraft.totalPages) || 1,
      finished: false,
    });
    setIsLogBookOpen(false);
  }

  function updateTrackedPages(value) {
    if (!requireLogin()) return;

    const nextPages = Math.max(0, Math.min(Number(value) || 0, trackedBook.totalPages));
    const shouldFinish = nextPages >= trackedBook.totalPages;

    setTrackedBook((book) => ({
      ...book,
      pagesRead: nextPages,
      finished: shouldFinish,
    }));

    if (shouldFinish && !trackedBook.finished) {
      setIsFinishReviewOpen(true);
    }
  }

  function finishTrackedBook() {
    if (!requireLogin()) return;
    setTrackedBook((book) => ({ ...book, pagesRead: book.totalPages, finished: true }));
    setIsFinishReviewOpen(true);
  }

  function submitFinishReview(event) {
    event.preventDefault();
    if (!requireLogin()) return;

    const savedReview = {
      book: trackedBook.title,
      author: trackedBook.author,
      isbn: trackedBook.isbn,
      rating: Number(finishReview.rating),
      note: finishReview.review.trim() || "Finished without a written review.",
      visibility: finishReview.visibility,
    };

    saveProfileReview(savedReview);

    if (finishReview.visibility === "public" && finishReview.review.trim()) {
      setPosts((currentPosts) => [
        {
          id: Date.now(),
          student: "You",
          year: "Reader",
          action: "reviewed",
          book: trackedBook.title,
          author: trackedBook.author,
          time: "just now",
          mood: "finished",
          place: "your shelf",
          accent: "forest",
          note: finishReview.review.trim(),
          rating: Number(finishReview.rating),
          progress: 100,
          shelf: "Finished",
          likes: 0,
          comments: [],
          liked: false,
          draftComment: "",
        },
        ...currentPosts,
      ]);
    }

    setFinishReview({ rating: 5, review: "", visibility: "public" });
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

  function publishNote(event) {
  event.preventDefault();

  if (!requireLogin()) return;

  const selectedBook =
    bookDatabasePreview.find((book) => book.title === composeDraft.bookTitle) ||
    bookDatabasePreview[0];

  const note = composeDraft.note.trim();

  if (!note) {
    return;
  }

  setPosts((currentPosts) => [
    {
      id: Date.now(),
      student: "You",
      year: "Reader",
      action: "posted a note about",
      book: selectedBook.title,
      author: selectedBook.author,
      time: "just now",
      mood: composeDraft.tags.trim() || "new note",
      place: "your shelf",
      accent: "sea",
      note,
      rating: 0,
      progress: 0,
      shelf: selectedBook.shelf,
      likes: 0,
      comments: [],
      liked: false,
      draftComment: "",
    },
    ...currentPosts,
  ]);

  setComposeDraft({
    bookTitle: selectedBook.title,
    note: "",
    tags: "",
  });

  setIsComposerOpen(false);
}

  return (
    <div className="home-page">
      <section className="reading-room-hero" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">138 readers opened a book today</p>
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
        <ol>
          {gradeLeaderboard.map((grade, index) => (
            <li className={grade.accent} key={grade.grade}>
              <span>{index + 1}</span>
              <div>
                <strong>{grade.grade}</strong>
                <small>{grade.books} books</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="home-grid">
        <aside className="shelf-rail" aria-label="Your reading shelves">
          {isLoggedIn ? (
            <>
              <section className="tracker-card">
                <p className="eyebrow">Your year</p>
                <div className="tracker-number">
                  <strong>27</strong>
                  <span>books read</span>
                </div>
                <div className="tracker-progress" aria-label="27 of 40 books read">
                  <span style={{ width: "68%" }} />
                </div>
                <p className="tracker-caption">13 books until your annual shelf goal.</p>
              </section>

              <section className="current-book-card" aria-label="Currently reading tracker">
                <div className="section-heading compact">
              <div>
                <p className="eyebrow">Currently Reading</p>
                <h2>Reading Tracker</h2>
              </div>
            </div>
            <article className="tracked-book-card home-tracked-book">
              <img src={getCoverUrl(trackedBook.isbn)} alt="" loading="lazy" />
              <div>
                <p>{trackedBook.author}</p>
                <strong>{trackedBook.title}</strong>
                <small>
                  {trackedBook.pagesRead} / {trackedBook.totalPages} pages
                </small>
              </div>
            </article>
            <div className="progress-editor compact">
              <label>
                <span>Pages read</span>
                <input
                  type="number"
                  min="0"
                  max={trackedBook.totalPages}
                  value={trackedBook.pagesRead}
                  onChange={(event) => updateTrackedPages(event.target.value)}
                />
              </label>
              <div>
                <span>{Math.round((trackedBook.pagesRead / trackedBook.totalPages) * 100)}%</span>
                <strong>{trackedBook.finished ? "Finished" : "In progress"}</strong>
              </div>
            </div>
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
              <button type="button" onClick={finishTrackedBook}>
                Finish
              </button>
            </div>
              </section>

              <section className="shelf-card">
                <div className="section-heading compact">
              <div>
                <p className="eyebrow">My shelves</p>
                <h2>Book stacks</h2>
              </div>
            </div>
            <div className="shelf-link-list">
              {shelfLinks.map((shelf) => (
                <button
  className={`shelf-link ${shelf.tone}`}
  type="button"
  key={shelf.label}
  onClick={() => {
    if (!requireLogin()) return;
  }}
>
                  <span className="cover-stack" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <strong>{shelf.label}</strong>
                    <small>{shelf.note}</small>
                  </span>
                  <em>{shelf.count}</em>
                </button>
              ))}
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
            {posts.map((post) => (
              <article className={`feed-card ${post.accent}`} key={post.id}>
                <header className="feed-card-header">
                  <div className="avatar-stack">
                    <div className="avatar" aria-hidden="true">
                      {post.student
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <span className="activity-dot" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="feed-title">
                      <strong>{post.student}</strong> {post.action}{" "}
                      <span>{post.book}</span>
                    </p>
                    <p className="feed-meta">
                      {post.year} | {post.place} | {post.time}
                    </p>
                  </div>
                </header>

                <div className="feed-note-bubble">
                  <p>{post.note}</p>
                  <span>{post.mood}</span>
                </div>

                <div className="book-strip">
                  <div className="book-cover" aria-hidden="true">
                    <span>{post.book}</span>
                  </div>
                  <div className="book-details">
                    <p>{post.shelf}</p>
                    <strong>{post.author}</strong>
                    <small>{post.progress}% through the book</small>
                    <div
                      className="bookmark-progress"
                      aria-label={`${post.progress}% complete`}
                    >
                      <span style={{ width: `${post.progress}%` }} />
                    </div>
                  </div>
                  <div className="rating" aria-label={`${post.rating} out of 5`}>
                    {post.rating > 0 ? `${post.rating} / 5` : "In progress"}
                  </div>
                </div>

                <div className="feed-actions">
                  <button
                    className={post.liked ? "feed-action active" : "feed-action"}
                    type="button"
                    onClick={() => toggleLike(post.id)}
                    aria-label={post.liked ? "Unlike post" : "Like post"}
                  >
                    <span aria-hidden="true">{post.liked ? "♥" : "♡"}</span>
                    <small>{post.likes}</small>
                  </button>
                  <button className="feed-action" type="button" aria-label="Comment on post">
                    <span aria-hidden="true">↩</span>
                    <small>{post.comments.length}</small>
                  </button>
                </div>

                <div className="comment-list">
                  {post.comments.slice(-2).map((comment) => (
                    <p key={comment}>{comment}</p>
                  ))}
                </div>

                <div className="comment-form">
                  <input
                    type="text"
                    value={post.draftComment}
                    onChange={(event) => updateDraft(post.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        addComment(post.id);
                      }
                    }}
                    placeholder="Add a quiet thought..."
                    aria-label={`Comment on ${post.book}`}
                  />
                  <button type="button" onClick={() => addComment(post.id)}>
                    Send
                  </button>
                </div>
              </article>
            ))}
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
                <select
                  value={composeDraft.bookTitle}
                  onChange={(event) =>
                    setComposeDraft((draft) => ({
                      ...draft,
                      bookTitle: event.target.value,
                    }))
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
              <label>
                <span>Tags</span>
                <input
                  type="text"
                  value={composeDraft.tags}
                  onChange={(event) =>
                    setComposeDraft((draft) => ({
                      ...draft,
                      tags: event.target.value,
                    }))
                  }
                  placeholder="rainy read, favorite quote, review..."
                />
              </label>
              <div className="modal-preview">
                <div className="tracked-cover" aria-hidden="true">
                  <span>{composeDraft.bookTitle}</span>
                </div>
                <p>This will appear in the social feed as your newest note.</p>
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
              onClick={() => setIsFinishReviewOpen(false)}
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
              <button className="primary-button full" type="submit">
                Save Review
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default Home;
