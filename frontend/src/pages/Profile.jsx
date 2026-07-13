import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getReadingList } from "../lib/readingList";

const CLUB_STORAGE_KEY = "litshelf-book-clubs-v1";
const PROFILE_REVIEWS_KEY = "litshelf-profile-reviews-v1";

const initialFavoriteBooks = [];

const profileShelves = [
  { label: "Read", slug: "read", tone: "butter", note: "finished and reviewed" },
  { label: "Currently Reading", slug: "currently-reading", tone: "sage", note: "open on your desk" },
  { label: "To Be Read", slug: "to-be-read", tone: "coral", note: "saved for later" },
];

const recentReviews = [
  {
    book: "The Goldfinch",
    author: "Donna Tartt",
    isbn: "9780316055444",
    rating: "4.5",
    note: "A sprawling, grief-soaked novel about art, loss, obsession, and the strange objects people cling to while trying to survive.",
  },
  {
    book: "The Year of Magical Thinking",
    author: "Joan Didion",
    isbn: "9781400078431",
    rating: "5.0",
    note: "Didion's memoir follows the year after her husband's sudden death, tracing grief with exacting clarity and restraint.",
  },
  {
    book: "Cleopatra and Frankenstein",
    author: "Coco Mellors",
    isbn: "9781635576818",
    rating: "4.0",
    note: "A New York marriage novel about desire, dependence, friendship, and the messy aftermath of choosing the wrong person beautifully.",
  },
  {
    book: "Normal People",
    author: "Sally Rooney",
    isbn: "9781984822185",
    rating: "4.0",
    note: "A contemporary novel about class, intimacy, miscommunication, and the long emotional pull between two people.",
  },
  {
    book: "Bluets",
    author: "Maggie Nelson",
    isbn: "9781933517407",
    rating: "5.0",
    note: "A fragmentary lyric essay about blue, desire, grief, philosophy, and the emotional texture of attention.",
  },
  {
    book: "Giovanni's Room",
    author: "James Baldwin",
    isbn: "9780345806567",
    rating: "5.0",
    note: "A classic novel about desire, shame, exile, and the devastating cost of refusing the truth of oneself.",
  },
  {
    book: "Open City",
    author: "Teju Cole",
    isbn: "9780812980097",
    rating: "4.0",
    note: "A meditative novel following a Nigerian-German psychiatrist walking through New York and reflecting on memory, history, and solitude.",
  },
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

function getSavedProfileReviews() {
  try {
    const savedReviews = JSON.parse(localStorage.getItem(PROFILE_REVIEWS_KEY));
    return Array.isArray(savedReviews) ? savedReviews : [];
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
    yearly_goal: 40,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [selectedFavorites, setSelectedFavorites] = useState(initialFavoriteBooks);
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [isFavoritePickerOpen, setIsFavoritePickerOpen] = useState(false);
  const [userShelves, setUserShelves] = useState(initialShelfBooks);
  const [savedReviews] = useState(getSavedProfileReviews);
  const [reviewPage, setReviewPage] = useState(0);
  const [readingList] = useState(getReadingList);
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

  function moveBookToShelf(book, currentShelfSlug, nextShelfSlug) {
    if (currentShelfSlug === nextShelfSlug) return;

    setUserShelves((currentShelves) => {
      const nextShelves = {
        ...currentShelves,
        [currentShelfSlug]: currentShelves[currentShelfSlug].filter(
          (shelfBook) => shelfBook.isbn !== book.isbn,
        ),
        [nextShelfSlug]: [
          book,
          ...currentShelves[nextShelfSlug].filter((shelfBook) => shelfBook.isbn !== book.isbn),
        ],
      };

      return nextShelves;
    });
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
    const booksRead = userShelves.read.length;
    const progress = Math.min(Math.round((booksRead / yearlyGoal) * 100), 100);
    const activeShelf = profileShelves.find((shelf) => shelf.slug === shelfSlug);
    const profileReviews = [...savedReviews, ...recentReviews];
    const reviewsPerPage = 5;
    const reviewPageCount = Math.ceil(profileReviews.length / reviewsPerPage);
    const visibleReviews = profileReviews.slice(
      reviewPage * reviewsPerPage,
      reviewPage * reviewsPerPage + reviewsPerPage,
    );

  if (shelfSlug && activeShelf) {
    const books = userShelves[activeShelf.slug] || [];

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
            <article className="profile-book-card" key={book.title}>
              <Link
                to={`/discover?search=${encodeURIComponent(book.title)}`}
                aria-label={`${book.title} by ${book.author}`}
              >
                <img src={getCoverUrl(book.isbn)} alt="" loading="lazy" />
                <div className="profile-book-popover">
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                  <p>{book.blurb}</p>
                </div>
              </Link>
              <label className="profile-shelf-select">
                <span>Move to</span>
                <select
                  value={activeShelf.slug}
                  onChange={(event) =>
                    moveBookToShelf(book, activeShelf.slug, event.target.value)
                  }
                >
                  {profileShelves.map((shelf) => (
                    <option value={shelf.slug} key={shelf.slug}>
                      {shelf.label}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
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
                  <Link
                    className="profile-favorite-book"
                    to={`/discover?search=${encodeURIComponent(book.title)}`}
                    key={book.title}
                    aria-label={`${book.title} by ${book.author}`}
                  >
                    <img src={getCoverUrl(book.isbn)} alt="" loading="lazy" />
                  </Link>
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
              <strong>{userShelves[shelf.slug]?.length || 0} books</strong>
              <small>{shelf.note}</small>
              <div
                className="profile-shelf-mini-books"
                aria-hidden="true"
                style={{ "--book-count": Math.min(userShelves[shelf.slug]?.length || 0, 8) }}
              >
                {Array.from({ length: Math.min(userShelves[shelf.slug]?.length || 0, 8) }).map(
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

        {readingList.length > 0 ? (
          <div className="profile-reading-list-grid">
            {readingList.map((book) => (
              <article key={book.isbn || book.openLibraryKey}>
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt={`Cover of ${book.title}`} loading="lazy" />
                ) : (
                  <div className="profile-reading-list-placeholder">No cover</div>
                )}
                <div>
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  {book.isbn ? <small>ISBN {book.isbn}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="profile-empty">Books you add from ISBN search will appear here.</p>
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
          {visibleReviews.map((review) => (
            <article className="profile-review" key={review.book}>
              <div className="profile-review-media">
                <img src={getCoverUrl(review.isbn)} alt="" loading="lazy" />
                <div className="profile-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                  {renderStars(review.rating)}
                </div>
              </div>
              <section>
                <p>{review.author}</p>
                <h3>{review.book}</h3>
                <strong>{review.rating}/5</strong>
                <small>{review.note}</small>
              </section>
            </article>
          ))}
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
                  placeholder="Carrie Wang"
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
    </section>
  );
}

export default Profile;
