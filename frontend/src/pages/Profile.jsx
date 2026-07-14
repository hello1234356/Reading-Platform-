import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { requireSupabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import BookDetailModal from "../components/BookDetailModal";
import ReviewModal from "../components/ReviewModal";
import { getOpenLibraryBookDetails } from "../lib/openLibrary";
import {
  getUserLibrary,
  moveLibraryBook,
} from "../lib/libraryApi";
import { getUserReviews, saveReview } from "../lib/reviewApi";
import { addPublicReviewToFeed } from "../lib/socialFeed";

const CLUB_STORAGE_KEY = "litshelf-book-clubs-v1";

const initialFavoriteBooks = [];

const profileShelves = [
  { label: "Read", slug: "read", tone: "butter", note: "finished and reviewed" },
  { label: "Currently Reading", slug: "currently-reading", tone: "sage", note: "open on your desk" },
  { label: "To Be Read", slug: "to-be-read", tone: "coral", note: "saved for later" },
];

const initialShelfBooks = {
  read: [
    {
      title: "The Goldfinch",
      author: "Donna Tartt",
      isbn: "9780316055444",
      blurb: "A Pulitzer Prize-winning novel about grief, art, class, obsession, and a stolen painting that follows one boy into adulthood.",
    },
    {
      title: "The Year of Magical Thinking",
      author: "Joan Didion",
      isbn: "9781400078431",
      blurb: "A precise, devastating memoir about mourning, memory, and the strange unreality that follows sudden loss.",
    },
    {
      title: "Normal People",
      author: "Sally Rooney",
      isbn: "9781984822185",
      blurb: "A spare, intimate novel about class, friendship, first love, and the long afterlife of almost saying what you mean.",
    },
    {
      title: "Giovanni's Room",
      author: "James Baldwin",
      isbn: "9780345806567",
      blurb: "A classic novel of desire, shame, exile, and self-recognition set between America and Paris.",
    },
  ],
  "currently-reading": [
    {
      title: "Bluets",
      author: "Maggie Nelson",
      isbn: "9781933517407",
      blurb: "A lyrical, fragmentary meditation on blue, grief, love, philosophy, and looking closely at ordinary feeling.",
    },
    {
      title: "The White Album",
      author: "Joan Didion",
      isbn: "9780374532079",
      blurb: "Essays on California, culture, violence, celebrity, and the stories people tell when meaning starts to collapse.",
    },
    {
      title: "My Friends",
      author: "Fredrik Backman",
      isbn: "9781982112820",
      blurb: "A novel about friendship, art, and the families people build when the world has not been gentle with them.",
    },
  ],
  "to-be-read": [
    {
      title: "Wuthering Heights",
      author: "Emily Bronte",
      isbn: "9780141439556",
      blurb: "A gothic story of obsession, revenge, inheritance, and a love that turns destructive across generations.",
    },
    {
      title: "The Great Gatsby",
      author: "F. Scott Fitzgerald",
      isbn: "9780743273565",
      blurb: "A glittering American classic about reinvention, wealth, longing, and the impossible green light across the bay.",
    },
    {
      title: "Better Than the Movies",
      author: "Lynn Painter",
      isbn: "9781534467620",
      blurb: "A romantic comedy about enemies, fake dating, movie-perfect fantasies, and the person who has been there all along.",
    },
    {
      title: "Cleopatra and Frankenstein",
      author: "Coco Mellors",
      isbn: "9781635576818",
      blurb: "A stylish contemporary novel about marriage, loneliness, art, addiction, and messy love in New York.",
    },
  ],
};

const favoriteBookOptions = Object.values(initialShelfBooks)
  .flat()
  .filter(
    (book, index, books) =>
      books.findIndex((candidate) => candidate.isbn === book.isbn) === index,
  );

function getCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

function getJoinedClubs() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLUB_STORAGE_KEY));

    if (!saved || !Array.isArray(saved.clubs) || !Array.isArray(saved.joinedIds)) {
      return [];
    }

    return saved.clubs.filter((club) => saved.joinedIds.includes(club.id));
  } catch {
    return [];
  }
}



function renderStars(rating) {
  const numericRating = Number(rating);

  return "★★★★★".split("").map((star, index) => {
    const starNumber = index + 1;
    const className =
      numericRating >= starNumber
        ? "filled"
        : numericRating >= starNumber - 0.5
          ? "half"
          : "";

    return (
    <span className={className} key={`${star}-${index}`}>
      ★
    </span>
    );
  });
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5a3 3 0 0 0 3 3" />
      <path d="M16 6h3a3 3 0 0 1-3 3" />
      <path d="M12 12v4" />
      <path d="M9 20h6" />
      <path d="M10 16h4v4h-4z" />
    </svg>
  );
}

function Profile() {
  const navigate = useNavigate();
  const { shelfSlug } = useParams();
  const { user, isLoggedIn, loading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    full_name: "",
    username: "",
    bio: "",
    yearly_goal: 40,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [selectedFavorites, setSelectedFavorites] = useState(initialFavoriteBooks);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [isFavoritePickerOpen, setIsFavoritePickerOpen] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewPage, setReviewPage] = useState(0);
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [movingBookId, setMovingBookId] = useState("");
  const [moveBookError, setMoveBookError] = useState("");
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
  const [reviewSaveError, setReviewSaveError] = useState("");
  
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError("");

      try {
        const supabase = requireSupabase();

        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, username, full_name, avatar_url, bio, yearly_goal, created_at, updated_at",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        setProfile(data);
      } catch (error) {
        console.error("Failed to load profile:", error);
        setProfileError(error.message || "Could not load your profile.");
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [user?.id]);
  
  useEffect(() => {
    async function loadLibrary() {
      if (!user?.id) {
        setLibraryBooks([]);
        setLibraryLoading(false);
        return;
      }

      setLibraryLoading(true);
      setLibraryError("");

      try {
        const books = await getUserLibrary(user.id);
        setLibraryBooks(books);
      } catch (error) {
        console.error("Failed to load library:", error);
        setLibraryError(error.message || "Could not load your reading list.");
      } finally {
        setLibraryLoading(false);
      }
    }

    loadLibrary();
  }, [user?.id]);

  useEffect(() => {
    async function loadReviews() {
      if (!user?.id) {
        setReviews([]);
        setReviewsLoading(false);
        return;
      }

      setReviewsLoading(true);
      setReviewsError("");

      try {
        const data = await getUserReviews(user.id);
        setReviews(data);
      } catch (error) {
        console.error(error);
        setReviewsError(
          error.message || "Could not load your reviews.",
        );
      } finally {
        setReviewsLoading(false);
      }
    }

    loadReviews();
  }, [user?.id]);

  function openEditProfile() {
    setProfileDraft({
      full_name: profile?.full_name || "",
      username: profile?.username || "",
      bio: profile?.bio || "",
      yearly_goal: profile?.yearly_goal ?? 40,
    });

    setProfileSaveError("");
    setIsEditProfileOpen(true);
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!user?.id) {
      setProfileSaveError("You must be logged in to edit your profile.");
      return;
    }

    const cleanedFullName = profileDraft.full_name.trim();
    const cleanedUsername = profileDraft.username
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

    const yearlyGoal = Number(profileDraft.yearly_goal);

    if (!cleanedFullName) {
      setProfileSaveError("Please enter your name.");
      return;
    }

    if (!cleanedUsername) {
      setProfileSaveError("Please enter a username.");
      return;
    }

    if (!/^[a-z0-9._-]+$/.test(cleanedUsername)) {
      setProfileSaveError(
        "Username can only contain letters, numbers, periods, underscores, and hyphens.",
      );
      return;
    }

    if (!Number.isInteger(yearlyGoal) || yearlyGoal < 1 || yearlyGoal > 500) {
      setProfileSaveError(
        "Yearly goal must be a whole number between 1 and 500.",
      );
      return;
    }

    setProfileSaving(true);
    setProfileSaveError("");

    try {
      const supabase = requireSupabase();

      const updates = {
        full_name: cleanedFullName,
        username: cleanedUsername,
        bio: profileDraft.bio.trim() || null,
        yearly_goal: yearlyGoal,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select(
          "id, username, full_name, avatar_url, bio, yearly_goal, created_at, updated_at",
        )
        .single();

      if (error) {
        throw error;
      }

      setProfile(data);
      setIsEditProfileOpen(false);
    } catch (error) {
      console.error("Failed to save profile:", error);

      if (error.code === "23505") {
        setProfileSaveError(
          "That username is already being used. Please choose another one.",
        );
      } else {
        setProfileSaveError(error.message || "Could not save your profile.");
      }
    } finally {
      setProfileSaving(false);
    }
  }
  const filteredFavoriteOptions = useMemo(() => {
    const normalizedSearch = favoriteSearch.trim().toLowerCase();

    return favoriteBookOptions.filter((book) => {
      const alreadySelected = selectedFavorites.some((favorite) => favorite.isbn === book.isbn);
      const matchesSearch = [book.title, book.author, book.isbn]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);

      return !alreadySelected && (!normalizedSearch || matchesSearch);
    });
  }, [favoriteSearch, selectedFavorites]);

  function addFavoriteBook(book) {
    setSelectedFavorites((currentFavorites) => {
      if (
        currentFavorites.length >= 4 ||
        currentFavorites.some((favorite) => favorite.isbn === book.isbn)
      ) {
        return currentFavorites;
      }

      return [...currentFavorites, book];
    });
    setIsFavoritePickerOpen(false);
    setFavoriteSearch("");
  }
  async function moveBookToShelf(book, nextShelfSlug) {
    if (!book?.shelfEntryId) {
      setMoveBookError("This book is missing its library entry ID.");
      return;
    }
    if (book.shelf === nextShelfSlug) {
      return;
    }

    setMovingBookId(book.shelfEntryId);
    setMoveBookError("");

    try {
      const updatedBook = await moveLibraryBook(
        book.shelfEntryId,
        nextShelfSlug,
      );

      setLibraryBooks((currentBooks) =>
        currentBooks.map((currentBook) =>
          currentBook.shelfEntryId === updatedBook.shelfEntryId
            ? updatedBook
            : currentBook,
        ),
      );

      if (nextShelfSlug === "read") {
        openReviewModal(updatedBook);
      }
    } catch (error) {
      console.error("Failed to move book:", error);
      setMoveBookError(
        error.message || "Could not move this book. Please try again.",
      );
    } finally {
      setMovingBookId("");
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

  function closeBookDetails() {
    setSelectedBook(null);
    setBookDetailError("");
    setBookDetailLoading(false);
  }

  function openReviewModal(book) {
    setReviewBook(book);
    setReviewDraft({ rating: book.rating || 5, review: "", visibility: "public" });
    setReviewSaveError("");
  }

  async function submitReview(event) {
    event.preventDefault();

    if (!user?.id || !reviewBook?.bookId) {
      setReviewSaveError("This review is missing its book details.");
      return;
    }

    setReviewSaving(true);
    setReviewSaveError("");

    try {
      const savedReview = await saveReview({
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

      setReviews((currentReviews) => [
        savedReview,
        ...currentReviews.filter((review) => review.bookId !== savedReview.bookId),
      ]);
      setReviewBook(null);
      setReviewDraft({ rating: 5, review: "", visibility: "public" });
      setReviewPage(0);
    } catch (error) {
      console.error("Failed to save review:", error);
      setReviewSaveError(error.message || "Could not save this review.");
    } finally {
      setReviewSaving(false);
    }
  }

  if (loading || profileLoading) {
    return <p>Loading profile...</p>;
  }

  if (!isLoggedIn) {
    return (
      <section className="home-page profile-page" aria-label="Personal profile">
        <header className="profile-hero">
          <div className="profile-photo" aria-hidden="true">?</div>
          <div>
            <p className="eyebrow">Personal Profile</p>
            <h1>Your Reading Journal</h1>
            <p>Log in to see your shelves, notes, clubs, and reading progress.</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate("/login")}
            >
              Log in / Sign up
            </button>
          </div>
        </header>
      </section>
    );
  }
  if (profileError) {
    return (
      <section className="home-page profile-page">
        <div className="error-panel">
          <p className="eyebrow">Profile error</p>
          <h1>We could not load your profile.</h1>
          <p>{profileError}</p>
        </div>
      </section>
    );
  }
  const joinedClubs = getJoinedClubs();
  const emailName = user?.email?.split("@")[0] || "reader";

  const fallbackDisplayName =
    emailName
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(" ") || "Tsinglan Reader";

  const displayName = profile?.full_name?.trim() || fallbackDisplayName;

  const username = profile?.username?.trim()
    ? `@${profile.username.replace(/^@/, "")}`
    : `@${emailName.toLowerCase()}`;

  const yearlyGoal = profile?.yearly_goal ?? 40;

  const readingList = libraryBooks.filter(
    (book) => book.shelf == null,
  );  

  const databaseShelves = {
    read: libraryBooks.filter((book) => book.shelf === "read"),
    "currently-reading": libraryBooks.filter(
      (book) => book.shelf === "currently-reading",
    ),
    "to-be-read": libraryBooks.filter(
      (book) => book.shelf === "to-be-read",
    ),
  };

  const booksRead = databaseShelves.read.length;
  const progress =
    yearlyGoal > 0
      ? Math.min(Math.round((booksRead / yearlyGoal) * 100), 100)
      : 0;

  const activeShelf = profileShelves.find(
    (shelf) => shelf.slug === shelfSlug,
  );

  const profileReviews = reviews;
  const reviewsPerPage = 5;
  const reviewPageCount = Math.max(
    1,
    Math.ceil(profileReviews.length / reviewsPerPage)
  );

  const visibleReviews = profileReviews.slice(
    reviewPage * reviewsPerPage,
    reviewPage * reviewsPerPage + reviewsPerPage,
  );

  if (shelfSlug && activeShelf) {
    const books = databaseShelves[activeShelf.slug] || [];

    return (
      <section className="home-page profile-page" aria-label={`${activeShelf.label} shelf`}>
        <Link className="blog-back-link" to="/profile">
          Back to Profile
        </Link>

        <header className="profile-shelf-page-header">
          <p className="eyebrow">Private Library</p>
          <h1>{activeShelf.label}</h1>
          <span>{books.length} books on this shelf</span>
        </header>

        <div className="profile-book-grid">
          {books.map((book) => (
            <article className="profile-book-card" key={book.shelfEntryId}>
              <button
                className="profile-book-detail-button"
                type="button"
                aria-label={`${book.title} by ${book.author}`}
                onClick={() => openBookDetails(book)}
              >
                <img src={getCoverUrl(book.isbn)} alt="" loading="lazy" />
                <div className="profile-book-popover">
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                  <p>{book.description || "No description available yet."}</p>
                </div>
              </button>
              <label className="profile-shelf-select">
                <span>Move to</span>
                <select
                  value={book.shelf || ""}
                  disabled={movingBookId === book.shelfEntryId}
                  onChange={(event) =>
                    moveBookToShelf(
                      book,
                      event.target.value || null,
                    )
                  }
                >
                  <option value="">My Reading List</option>

                  {profileShelves.map((shelf) => (
                    <option value={shelf.slug} key={shelf.slug}>
                      {shelf.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeShelf.slug === "read" ? (
                <button
                  className="profile-review-book-button"
                  type="button"
                  onClick={() => openReviewModal(book)}
                >
                  Add Review
                </button>
              ) : null}
            </article>
          ))}
        </div>
        <BookDetailModal
          book={selectedBook}
          loading={bookDetailLoading}
          error={bookDetailError}
          onClose={closeBookDetails}
        />
        <ReviewModal
          book={reviewBook}
          draft={reviewDraft}
          saving={reviewSaving}
          error={reviewSaveError}
          showVisibility
          onChange={setReviewDraft}
          onClose={() => {
            if (!reviewSaving) {
              setReviewBook(null);
              setReviewSaveError("");
            }
          }}
          onSubmit={submitReview}
        />
      </section>
    );
  }

  return (
    <section className="home-page profile-page" aria-label="Personal profile">
      <header className="profile-hero">
        <div className="profile-banner">
          <div className="profile-identity">
            <div className="profile-photo" aria-hidden="true">
              {displayName.slice(0, 1)}
            </div>
            <div>
              <p className="eyebrow">Personal Profile</p>
              <h1>{displayName}</h1>
              <span>{username}</span>

              {profile?.bio ? (
                <p className="profile-bio">{profile.bio}</p>
              ) : null}

              <button
                className="profile-edit-button"
                type="button"
                onClick={openEditProfile}
              >
                Edit Profile
              </button>
            </div>
          </div>

          <div className="profile-favorites" aria-label="Four favorite books">
            <p>Four Favorites</p>
            {selectedFavorites.length > 0 ? (
              <div>
                {selectedFavorites.map((book) => (
	                  <button
	                    className="profile-favorite-book"
                      type="button"
	                    key={book.title}
	                    aria-label={`${book.title} by ${book.author}`}
                      onClick={() => openBookDetails(book)}
	                  >
                    {book.coverUrl || book.isbn ? (
                      <img
                        src={book.coverUrl || getCoverUrl(book.isbn)}
                        alt={`Cover of ${book.title}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="profile-reading-list-placeholder">
                        No cover
                      </div>
                    )}
	                  </button>
                ))}
                {selectedFavorites.length < 4 ? (
                  <button
                    className="profile-favorite-add compact"
                    type="button"
                    aria-label="Add another favorite book"
                    onClick={() => setIsFavoritePickerOpen(true)}
                  >
                    +
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                className="profile-favorites-empty"
                type="button"
                onClick={() => setIsFavoritePickerOpen(true)}
              >
                <span className="profile-favorite-add" aria-hidden="true">+</span>
                <strong>Add your four favorite books</strong>
                <small>Search the ISBN database and pin the books that feel most like you.</small>
              </button>
            )}
          </div>
        </div>

        <aside className="profile-challenge" aria-label="2026 reading challenge">
          <span className="profile-challenge-icon">
            <TrophyIcon />
          </span>
          <p className="eyebrow">2026 Reading Challenge</p>
          <h2>{booksRead} / {yearlyGoal}</h2>
          <span>books completed</span>
          <div className="profile-progress" aria-label={`${progress}% complete`}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>{progress}% of this year's goal</small>
        </aside>
      </header>

      <section className="profile-shelf-overview" aria-label="Personal bookshelves">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Private Library</p>
            <h2>Your Shelves</h2>
          </div>
        </div>

        <div className="profile-shelf-grid">
          {profileShelves.map((shelf) => (
            <Link
              className={`profile-shelf-card ${shelf.tone}`}
              to={`/profile/shelves/${shelf.slug}`}
              key={shelf.label}
            >
              <span>{shelf.label}</span>
              <strong>{databaseShelves[shelf.slug]?.length || 0} books</strong>
              <small>{shelf.note}</small>
              <div
                className="profile-shelf-mini-books"
                aria-hidden="true"
                style={{ "--book-count": Math.min(databaseShelves[shelf.slug]?.length || 0, 8) }}
              >
                {Array.from({ length: Math.min(databaseShelves[shelf.slug]?.length || 0, 8) }).map(
                  (_, index) => (
                    <i key={`${shelf.slug}-${index}`} />
                  ),
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="profile-reading-list" aria-label="My reading list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Saved from search</p>
            <h2>My Reading List</h2>
          </div>
          <Link className="ghost-button" to="/discover">Find Books</Link>
        </div>
        {libraryLoading ? (
          <p className="profile-empty">Loading your reading list...</p>
        ) : libraryError ? (
          <p className="profile-save-error">{libraryError}</p>
        ) : readingList.length > 0 ? (
          <>
            <div className="profile-reading-list-grid">
              {readingList.map((book) => {
                const isMoving = movingBookId === book.shelfEntryId;

                return (
	                  <article key={book.shelfEntryId}>
                      <button
                        className="profile-reading-list-book-button"
                        type="button"
                        onClick={() => openBookDetails(book)}
                        aria-label={`View details for ${book.title}`}
                      >
  	                    {book.coverUrl ? (
  	                      <img
  	                        src={book.coverUrl}
  	                        alt={`Cover of ${book.title}`}
  	                        loading="lazy"
  	                      />
  	                    ) : (
  	                      <div className="profile-reading-list-placeholder">
  	                        No cover
  	                      </div>
  	                    )}
                      </button>

                    <div>
                      <h3>{book.title}</h3>
                      <p>{book.author}</p>

                      {book.isbn ? (
                        <small>ISBN {book.isbn}</small>
                      ) : null}

                      <label className="profile-shelf-select">
                        <span>Add to a shelf</span>

                        <select
                          value=""
                          disabled={isMoving}
                          onChange={(event) => {
                            const nextShelf = event.target.value;

                            if (nextShelf) {
                              moveBookToShelf(book, nextShelf);
                            }
                          }}
                        >
                          <option value="">
                            {isMoving ? "Moving..." : "Choose shelf"}
                          </option>

                          <option value="to-be-read">
                            To Be Read
                          </option>

                          <option value="currently-reading">
                            Currently Reading
                          </option>

                          <option value="read">
                            Read
                          </option>
                        </select>
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>

            {moveBookError ? (
              <p className="profile-save-error" role="alert">
                {moveBookError}
              </p>
            ) : null}
          </>
        ) : (
          <p className="profile-empty">
            Books you add from ISBN search will appear here.
          </p>
        )}
      </section>

      <section className="profile-reviews" aria-label="Ratings and reviews">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reading Notes</p>
            <h2>Ratings & Reviews</h2>
          </div>
        </div>

        <div className="profile-review-list">
          {reviewsLoading ? (
            <p className="profile-empty">Loading reviews...</p>
          ) : reviewsError ? (
            <p className="profile-save-error">{reviewsError}</p>
          ) : visibleReviews.length > 0 ? (
            visibleReviews.map((review) => (
              <article
                className="profile-review"
                key={review.id || review.bookId}
              >
                <div className="profile-review-media">
                  <img
                    src={review.coverUrl || getCoverUrl(review.isbn)}
                    alt=""
                    loading="lazy"
                  />

                  <div
                    className="profile-review-stars"
                    aria-label={`${review.rating} out of 5 stars`}
                  >
                    {renderStars(review.rating)}
                  </div>
                </div>

                <section>
                  <p>{review.author}</p>
                  <h3>{review.book}</h3>
                  <strong>{review.rating}/5</strong>
                  <small>{review.text}</small>
                </section>
              </article>
            ))
          ) : (
            <p className="profile-empty">
              You haven't reviewed any books yet.
            </p>
          )}
        </div>
        {reviewPageCount > 1 ? (
          <div className="profile-review-pagination">
            <button
              type="button"
              disabled={reviewPage === 0}
              onClick={() => setReviewPage((page) => Math.max(page - 1, 0))}
            >
              Previous
            </button>
            <span>
              Page {reviewPage + 1} of {reviewPageCount}
            </span>
            <button
              type="button"
              disabled={reviewPage >= reviewPageCount - 1}
              onClick={() =>
                setReviewPage((page) => Math.min(page + 1, reviewPageCount - 1))
              }
            >
              Next
            </button>
          </div>
        ) : null}
      </section>

      <section className="profile-clubs" aria-label="Your book clubs">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reading Circles</p>
            <h2>Your Book Clubs</h2>
          </div>
          <Link className="ghost-button" to="/clubs">
            Browse Clubs
          </Link>
        </div>

        {joinedClubs.length > 0 ? (
          <div className="profile-club-list">
            {joinedClubs.map((club) => (
              <Link className="profile-club-link" to={`/clubs/${club.id}`} key={club.id}>
                <span>{club.bookTitle?.slice(0, 1) || "L"}</span>
                <div>
                  <strong>{club.title}</strong>
                  <small>{club.bookTitle} by {club.author}</small>
                </div>
                <em>{club.membersJoined}/{club.membersWanted}</em>
              </Link>
            ))}
          </div>
        ) : (
          <p className="profile-empty">Your shelf is waiting for its first reading circle.</p>
        )}
      </section>
      {isEditProfileOpen ? (
        <div
          className="composer-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !profileSaving) {
              setIsEditProfileOpen(false);
            }
          }}
        >
          <article
            className="profile-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-edit-title"
          >
            <button
              className="modal-close"
              type="button"
              aria-label="Close profile editor"
              disabled={profileSaving}
              onClick={() => setIsEditProfileOpen(false)}
            >
              ×
            </button>

            <p className="eyebrow">Personal Profile</p>
            <h2 id="profile-edit-title">Edit your profile</h2>

            <form onSubmit={saveProfile}>
              <label>
                <span>Full name</span>
                <input
                  type="text"
                  value={profileDraft.full_name}
                  onChange={(event) =>
                    setProfileDraft((currentDraft) => ({
                      ...currentDraft,
                      full_name: event.target.value,
                    }))
                  }
                  placeholder="Aenaul Orgi"
                  maxLength="80"
                  disabled={profileSaving}
                />
              </label>

              <label>
                <span>Username</span>

                <div className="profile-username-input">
                  <span aria-hidden="true">@</span>
                  <input
                    type="text"
                    value={profileDraft.username}
                    onChange={(event) =>
                      setProfileDraft((currentDraft) => ({
                        ...currentDraft,
                        username: event.target.value,
                      }))
                    }
                    placeholder="carrie.wang"
                    maxLength="40"
                    disabled={profileSaving}
                  />
                </div>
              </label>

              <label>
                <span>Bio</span>
                <textarea
                  value={profileDraft.bio}
                  onChange={(event) =>
                    setProfileDraft((currentDraft) => ({
                      ...currentDraft,
                      bio: event.target.value,
                    }))
                  }
                  placeholder="Tell other readers a little about yourself..."
                  rows="4"
                  maxLength="300"
                  disabled={profileSaving}
                />
                <small>{profileDraft.bio.length}/300</small>
              </label>

              <label>
                <span>2026 reading goal</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  value={profileDraft.yearly_goal}
                  onChange={(event) =>
                    setProfileDraft((currentDraft) => ({
                      ...currentDraft,
                      yearly_goal: event.target.value,
                    }))
                  }
                  disabled={profileSaving}
                />
              </label>

              {profileSaveError ? (
                <p className="profile-save-error" role="alert">
                  {profileSaveError}
                </p>
              ) : null}

              <button
                className="primary-button full"
                type="submit"
                disabled={profileSaving}
              >
                {profileSaving ? "Saving..." : "Save profile"}
              </button>
            </form>
          </article>
        </div>
      ) : null}
      {isFavoritePickerOpen ? (
        <div className="composer-modal-backdrop" role="presentation">
          <article
            className="favorite-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="favorite-picker-title"
          >
            <button
              className="modal-close"
              type="button"
              aria-label="Close favorite picker"
              onClick={() => setIsFavoritePickerOpen(false)}
            >
              x
            </button>
            <p className="eyebrow">Four Favorites</p>
            <h2 id="favorite-picker-title">Add a favorite book</h2>
            <label>
              <span>Search books</span>
              <input
                type="search"
                value={favoriteSearch}
                onChange={(event) => setFavoriteSearch(event.target.value)}
                placeholder="Search by title, author, or ISBN..."
              />
            </label>
            <div className="favorite-picker-results">
              {filteredFavoriteOptions.slice(0, 6).map((book) => (
                <button type="button" key={book.isbn} onClick={() => addFavoriteBook(book)}>
                  <img src={getCoverUrl(book.isbn)} alt="" loading="lazy" />
                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.author}</small>
                  </span>
                </button>
              ))}
            </div>
          </article>
        </div>
      ) : null}
      <BookDetailModal
        book={selectedBook}
        loading={bookDetailLoading}
        error={bookDetailError}
        onClose={closeBookDetails}
      />
      <ReviewModal
        book={reviewBook}
        draft={reviewDraft}
        saving={reviewSaving}
        error={reviewSaveError}
        showVisibility
        onChange={setReviewDraft}
        onClose={() => {
          if (!reviewSaving) {
            setReviewBook(null);
            setReviewSaveError("");
          }
        }}
        onSubmit={submitReview}
      />
    </section>
  );
}

export default Profile;
