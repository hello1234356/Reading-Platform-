import { Link, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requireSupabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import BookDetailModal from "../components/BookDetailModal";
import ReviewModal from "../components/ReviewModal";
import { getOpenLibraryBookDetails } from "../lib/openLibrary";
import {
  getUserLibrary,
  moveLibraryBook,
  removeLibraryBook,
} from "../lib/libraryApi";
import { getUserReviews, saveReview } from "../lib/reviewApi";
import { addPublicReviewToFeed } from "../lib/socialFeed";
import { getBookClubs } from "../lib/bookClubApi";

const profileShelves = [
  { label: "Read", slug: "read", tone: "butter", note: "finished and reviewed" },
  { label: "Currently Reading", slug: "currently-reading", tone: "sage", note: "open on your desk" },
  { label: "To Be Read", slug: "to-be-read", tone: "coral", note: "saved for later" },
];

function getCoverUrl(isbn) {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
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
    bio: "",
    yearly_goal: 40,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [selectedFavorites, setSelectedFavorites] = useState([]);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [isFavoritePickerOpen, setIsFavoritePickerOpen] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewPage, setReviewPage] = useState(0);
  const [libraryBooks, setLibraryBooks] = useState([]);
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
  const [joinedClubs, setJoinedClubs] = useState([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState("");
  

  const loadFavoriteBooks = useCallback(async (profileData) => {
    const ids = [
      profileData.favorite_book_1,
      profileData.favorite_book_2,
      profileData.favorite_book_3,
      profileData.favorite_book_4,
    ].filter(Boolean);

    if (ids.length === 0) {
      setSelectedFavorites([]);
      return;
    }

    const books = await Promise.all(
      ids.map((isbn) => getOpenLibraryBookDetails({ isbn })),
    );

    setSelectedFavorites(books);
  }, []);
  
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
            "id, username, full_name, avatar_url, bio, yearly_goal, favorite_book_1, favorite_book_2, favorite_book_3, favorite_book_4, created_at, updated_at",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        setProfile(data);
        if (data) {
          loadFavoriteBooks(data);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
        setProfileError(error.message || "Could not load your profile.");
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [loadFavoriteBooks, user?.id]);
  
  useEffect(() => {
    async function loadLibrary() {
      if (!user?.id) {
        setLibraryBooks([]);
        return;
      }

      try {
        const books = await getUserLibrary(user.id);
        setLibraryBooks(books);
      } catch (error) {
        console.error("Failed to load library:", error);
      }
    }

    loadLibrary();
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadJoinedClubs() {
      if (!user?.id) {
        setJoinedClubs([]);
        setClubsLoading(false);
        return;
      }

      setClubsLoading(true);
      setClubsError("");

      try {
        const clubs = await getBookClubs(user.id);

        if (!cancelled) {
          setJoinedClubs(
            clubs.filter((club) => club.isJoined),
          );
        }
      } catch (error) {
        console.error("Failed to load profile clubs:", error);

        if (!cancelled) {
          setClubsError(
            error.message || "Could not load your book clubs.",
          );
        }
      } finally {
        if (!cancelled) {
          setClubsLoading(false);
        }
      }
    }

    loadJoinedClubs();

    return () => {
      cancelled = true;
    };
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
    const yearlyGoal = Number(profileDraft.yearly_goal);

    if (!cleanedFullName) {
      setProfileSaveError("Please enter your name.");
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
        bio: profileDraft.bio.trim() || null,
        yearly_goal: yearlyGoal,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select(
          "id, username, full_name, avatar_url, bio, yearly_goal, favorite_book_1, favorite_book_2, favorite_book_3, favorite_book_4, created_at, updated_at",
        )
        .single();

      if (error) {
        throw error;
      }

      setProfile(data);
      setIsEditProfileOpen(false);
    } catch (error) {
      console.error("Failed to save profile:", error);

      setProfileSaveError(error.message || "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  }
  const filteredFavoriteOptions = useMemo(() => {
    const normalizedSearch = favoriteSearch.trim().toLowerCase();

    return libraryBooks.filter((book) => {
      const alreadySelected = selectedFavorites.some(
        (favorite) => favorite.isbn === book.isbn,
      );

      const matchesSearch = [book.title, book.author, book.isbn]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);

      return !alreadySelected && (!normalizedSearch || matchesSearch);
    });
  }, [favoriteSearch, selectedFavorites, libraryBooks]);

  async function addFavoriteBook(book) {
    if (!user?.id || !profile) return;

    const favoriteColumns = [
      "favorite_book_1",
      "favorite_book_2",
      "favorite_book_3",
      "favorite_book_4",
    ];

    const updates = {};

    for (const column of favoriteColumns) {
      if (!profile[column]) {
        updates[column] = book.isbn;
        break;
      }
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    const supabase = requireSupabase();

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setProfile(data);
    loadFavoriteBooks(data);

    setFavoriteSearch("");
    setIsFavoritePickerOpen(false);
  }
  async function removeFavoriteBook(isbn) {
    if (!user?.id || !profile) return;

    const remainingFavorites = [
      profile.favorite_book_1,
      profile.favorite_book_2,
      profile.favorite_book_3,
      profile.favorite_book_4,
    ].filter((favoriteIsbn) => favoriteIsbn && favoriteIsbn !== isbn);

    const updates = {
      favorite_book_1: remainingFavorites[0] || null,
      favorite_book_2: remainingFavorites[1] || null,
      favorite_book_3: remainingFavorites[2] || null,
      favorite_book_4: remainingFavorites[3] || null,
    };

    const supabase = requireSupabase();

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Failed to remove favorite:", error);
      return;
    }

    setProfile(data);
    loadFavoriteBooks(data);
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
  async function deleteLibraryBook(book) {
    if (!book?.shelfEntryId) {
      setMoveBookError("This book is missing its library entry ID.");
      return;
    }

    if (!window.confirm(`Remove “${book.title}” from your library?`)) {
      return;
    }

    setMovingBookId(book.shelfEntryId);
    setMoveBookError("");

    try {
      await removeLibraryBook(book.shelfEntryId);

      setLibraryBooks((currentBooks) =>
        currentBooks.filter(
          (currentBook) =>
            currentBook.shelfEntryId !== book.shelfEntryId,
        ),
      );

      const isFavorite = [
        profile?.favorite_book_1,
        profile?.favorite_book_2,
        profile?.favorite_book_3,
        profile?.favorite_book_4,
      ].includes(book.isbn);

      if (isFavorite) {
        await removeFavoriteBook(book.isbn);
      }
    } catch (error) {
      console.error("Failed to remove library book:", error);

      setMoveBookError(
        error.message || "Could not remove this book.",
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
  const emailName = user?.email?.split("@")[0] || "reader";

  const fallbackDisplayName =
    emailName
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(" ") || "Tsinglan Reader";

  const displayName = profile?.full_name?.trim() || fallbackDisplayName;

  const schoolEmail = user?.email || `${emailName.toLowerCase()}@tsinglan.cn`;

  const yearlyGoal = profile?.yearly_goal ?? 40;

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
                  onChange={(event) => {
                    const nextValue = event.target.value;

                    if (nextValue === "remove") {
                      deleteLibraryBook(book);
                    } else {
                      moveBookToShelf(book, nextValue || null);
                    }
                  }}
                >

                  {profileShelves.map((shelf) => (
                    <option value={shelf.slug} key={shelf.slug}>
                      {shelf.label}
                    </option>
                    
                  ))}
                  <option value="remove">Remove from Library</option>
                </select>
              </label>
              <div className="profile-book-actions">
                {activeShelf.slug === "read" ? (
                  <button
                    className="profile-review-book-button"
                    type="button"
                    onClick={() => openReviewModal(book)}
                    disabled={movingBookId === book.shelfEntryId}
                  >
                    Add Review
                  </button>
                ) : null}
                <button
                  className="profile-remove-book-button"
                  type="button"
                  onClick={() => deleteLibraryBook(book)}
                  disabled={movingBookId === book.shelfEntryId}
                >
                  {movingBookId === book.shelfEntryId
                    ? "Removing..."
                    : "Remove from Library"}
                </button>
              </div>
            </article>
          ))}
        </div>
        {moveBookError ? (
          <p className="profile-save-error" role="alert">
            {moveBookError}
          </p>
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
              <span>{schoolEmail}</span>

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
                  <div
                    className="profile-favorite-wrapper"
                    key={book.isbn}
                  >
                    <button
                      className="profile-favorite-remove"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFavoriteBook(book.isbn);
                      }}
                    >
                      ×
                    </button>

                    <button
                      className="profile-favorite-book"
                      type="button"
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
                  </div>
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

        {clubsLoading ? (
  <p className="profile-empty">
    Loading your book clubs...
  </p>
) : clubsError ? (
  <p className="profile-save-error">
    {clubsError}
  </p>
) : joinedClubs.length > 0 ? (
  <div className="profile-club-list">
    {joinedClubs.map((club) => (
      <Link
        className="profile-club-link"
        to={`/clubs/${club.id}`}
        key={club.id}
      >
        <span className="profile-club-cover">
          {club.coverUrl || club.isbn ? (
            <img
              src={club.coverUrl || getCoverUrl(club.isbn)}
              alt=""
              loading="lazy"
            />
          ) : (
            club.bookTitle?.slice(0, 1) || "L"
          )}
        </span>

        <div>
          <strong>{club.title}</strong>

          <small>
            {club.bookTitle} by {club.author}
          </small>

          <small>
            Hosted by {club.creatorName}
          </small>
        </div>

        <em>
          {club.memberCount}/{club.membersWanted}
        </em>
      </Link>
    ))}
  </div>
) : (
  <p className="profile-empty">
    Your shelf is waiting for its first reading circle.
  </p>
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
                  placeholder="Full Name"
                  maxLength="80"
                  disabled={profileSaving}
                />
              </label>

              <label>
                <span>School email</span>

                <div className="profile-school-email-input">
                  <input
                    type="email"
                    value={schoolEmail}
                    readOnly
                    aria-readonly="true"
                  />
                </div>
                <small>Your school email is linked to your account and cannot be changed here.</small>
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
                <button
                  type="button"
                  key={book.bookId || book.isbn}
                  onClick={() => addFavoriteBook(book)}
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

                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.author}</small>
                  </span>
                </button>
              ))}
              {filteredFavoriteOptions.length === 0 ? (
                <p className="profile-empty">
                  {libraryBooks.length === 0
                    ? "Add books from Discover before choosing your favorites."
                    : "No matching books found in your library."}
                </p>
              ) : null}
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
