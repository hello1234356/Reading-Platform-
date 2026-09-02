import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { requireSupabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import BookDetailModal from "../components/BookDetailModal";
import ReviewModal from "../components/ReviewModal";
import BookCoverImage from "../components/BookCoverImage";
import { loadBookDetailsSafely, loadProviderBookDetails } from "../lib/bookDetails";
import {
  getUserLibrary,
  moveLibraryBook,
  removeLibraryBook,
  updateLibraryBookProgress,
} from "../lib/libraryApi";
import { getUserReviews, saveReview } from "../lib/reviewApi";
import { getBookClubs } from "../lib/bookClubApi";
import { createPost } from "../lib/postApi";
import StarRating from "../components/StarRating";
import FittedProfileName from "../components/FittedProfileName";
import {
  uploadUserAvatar,
  syncUserGrade,
} from "../lib/profileApi";
import { getGradeFromSchoolEmail } from "../lib/grade";
import {
  getPublicDisplayName,
  schoolEmailToOfficialName,
} from "../lib/identity";

const profileShelves = [
  { label: "Read", slug: "read", tone: "butter", note: "Finished and reviewed" },
  { label: "Currently Reading", slug: "currently-reading", tone: "sage", note: "Open on your desk" },
  { label: "To Be Read", slug: "to-be-read", tone: "coral", note: "Saved for later" },
];

const USERNAME_CHARACTER_LIMIT = 20;

function countDisplayCharacters(value = "") {
  return Array.from(String(value).trim()).length;
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shelfSlug } = useParams();
  const { user, isLoggedIn, loading } = useAuth();
  const localizedProfileShelves = profileShelves.map((shelf) => ({
    ...shelf,
    label: shelf.slug === "read" ? t("search.read") : shelf.slug === "currently-reading" ? t("books.currentlyReading") : t("search.toBeRead"),
    note: shelf.slug === "read" ? t("profile.readNote") : shelf.slug === "currently-reading" ? t("profile.currentNote") : t("profile.tbrNote"),
  }));
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    username: "",
    bio: "",
    yearly_goal: 40,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState("");
  const [favoriteSearch, setFavoriteSearch] = useState("");
  const [isFavoritePickerOpen, setIsFavoritePickerOpen] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewPage, setReviewPage] = useState(0);
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [movingBookId, setMovingBookId] = useState("");
  const [moveBookError, setMoveBookError] = useState("");
  const [progressBookId, setProgressBookId] = useState("");
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
  const [reviewSaveError, setReviewSaveError] = useState("");
  const [joinedClubs, setJoinedClubs] = useState([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState("");
  const usernameCharacterCount = countDisplayCharacters(
    profileDraft.username,
  );
  const usernameCharactersOverLimit = Math.max(
    0,
    usernameCharacterCount - USERNAME_CHARACTER_LIMIT,
  );
  
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
            "id, username, full_name, avatar_url, bio, yearly_goal, grade, account_type, favorite_book_1, favorite_book_2, favorite_book_3, favorite_book_4, created_at, updated_at",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data?.grade == null) {
          const updatedProfile = await syncUserGrade(
            user.id,
            user.email,
          );

          setProfile(updatedProfile);
        } else {
          setProfile(data);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
        setProfileError(error.message || "Could not load your profile.");
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [user?.email, user?.id]);
  
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
  return () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
  };
}, [avatarPreview]);

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

  async function selectAvatarFile(event) {
    const file = event.target.files?.[0];

    setAvatarUploadError("");

    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setAvatarUploadError("Please choose a JPG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarUploadError("Your profile photo must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    const nextPreviewUrl = URL.createObjectURL(file);
    setAvatarPreview(nextPreviewUrl);
    await saveAvatar(file, nextPreviewUrl);
    event.target.value = "";
  }

  async function saveAvatar(fileToUpload = avatarFile, previewUrl = avatarPreview) {
    if (!user?.id) {
      setAvatarUploadError("You must be logged in to upload a profile photo.");
      return;
    }

    if (!fileToUpload) {
      setAvatarUploadError("Please choose an image first.");
      return;
    }

    setAvatarUploading(true);
    setAvatarUploadError("");

    try {
      const updatedProfile = await uploadUserAvatar(
        user.id,
        fileToUpload,
      );

      setProfile(updatedProfile);
      setAvatarFile(null);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setAvatarPreview("");
    } catch (error) {
      console.error("Failed to upload avatar:", error);

      setAvatarFile(null);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setAvatarPreview("");
      setAvatarUploadError(
        error.message || "Could not upload your profile photo.",
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  function openEditProfile() {
    setProfileDraft({
      username: profile?.username || "",
      bio: profile?.bio || "",
      yearly_goal: profile?.yearly_goal ?? 40,
    });

    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(null);
    setAvatarPreview("");
    setAvatarUploadError("");
    setProfileSaveError("");
    setIsEditProfileOpen(true);
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!user?.id) {
      setProfileSaveError("You must be logged in to edit your profile.");
      return;
    }

    const cleanedUsername = profileDraft.username.trim();
    const usernameCharacterCount = countDisplayCharacters(cleanedUsername);
    const yearlyGoal = Number(profileDraft.yearly_goal);

    if (!cleanedUsername) {
      setProfileSaveError("Please enter a username.");
      return;
    }

    if (usernameCharacterCount > USERNAME_CHARACTER_LIMIT) {
      setProfileSaveError(
        `Username is ${usernameCharacterCount - USERNAME_CHARACTER_LIMIT} character${
          usernameCharacterCount - USERNAME_CHARACTER_LIMIT === 1 ? "" : "s"
        } over the 20-character limit. Please shorten it.`,
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
        username: cleanedUsername,
        bio: profileDraft.bio.trim() || null,
        yearly_goal: yearlyGoal,
        grade: getGradeFromSchoolEmail(user.email),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select(
          "id, username, full_name, avatar_url, bio, yearly_goal, grade, account_type, favorite_book_1, favorite_book_2, favorite_book_3, favorite_book_4, created_at, updated_at",
        )
        .single();

      if (error) {
        throw error;
      }

      setProfile(data);
      setIsEditProfileOpen(false);
    } catch (error) {
      console.error("Failed to save profile:", error);

      setProfileSaveError(
        error.code === "23505"
          ? "That username is already in use. Please choose another one."
          : error.message || "Could not save your profile.",
      );
    } finally {
      setProfileSaving(false);
    }
  }
  const selectedFavorites = useMemo(() => {
    const favoriteIsbns = [
      profile?.favorite_book_1,
      profile?.favorite_book_2,
      profile?.favorite_book_3,
      profile?.favorite_book_4,
    ].filter(Boolean);

    return favoriteIsbns.map((isbn) => {
      const libraryBook = libraryBooks.find(
        (book) => String(book.isbn) === String(isbn),
      );

      return libraryBook || {
        isbn,
        title: "Favorite book",
        author: "Unknown author",
        coverUrl: "",
      };
    });
  }, [
    profile?.favorite_book_1,
    profile?.favorite_book_2,
    profile?.favorite_book_3,
    profile?.favorite_book_4,
    libraryBooks,
  ]);
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
  const reviewsByBookId = useMemo(() => {
      return new Map(
        reviews.map((review) => [
          String(review.bookId),
          review,
        ]),
      );
    }, [reviews]);
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
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select(`
        id,
        username,
        full_name,
        avatar_url,
        bio,
        yearly_goal,
        grade,
        favorite_book_1,
        favorite_book_2,
        favorite_book_3,
        favorite_book_4,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setProfile(data);
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
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select(`
        id,
        username,
        full_name,
        avatar_url,
        bio,
        yearly_goal,
        grade,
        favorite_book_1,
        favorite_book_2,
        favorite_book_3,
        favorite_book_4,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error("Failed to remove favorite:", error);
      return;
    }

    setProfile(data);
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

  async function changeBookProgress(book, field, value) {
    if (!book?.shelfEntryId) {
      setMoveBookError("This book is missing its library entry ID.");
      return;
    }

    const nextTotalPages =
      field === "totalPages"
        ? Math.max(0, Math.round(Number(value) || 0))
        : Math.max(0, Math.round(Number(book.totalPages) || 0));
    const nextPagesRead = Math.min(
      field === "pagesRead"
        ? Math.max(0, Math.round(Number(value) || 0))
        : Math.max(0, Math.round(Number(book.pagesRead) || 0)),
      nextTotalPages || Infinity,
    );
    const nextProgress = nextTotalPages
      ? Math.min(Math.round((nextPagesRead / nextTotalPages) * 100), 100)
      : 0;

    setProgressBookId(book.shelfEntryId);
    setMoveBookError("");

    try {
      const updatedBook = await updateLibraryBookProgress(
        book.shelfEntryId,
        {
          pagesRead: nextPagesRead,
          totalPages: nextTotalPages || null,
        },
      );

      setLibraryBooks((currentBooks) =>
        currentBooks.map((currentBook) =>
          currentBook.shelfEntryId === updatedBook.shelfEntryId
            ? updatedBook
            : currentBook,
        ),
      );

      if (updatedBook.shelf === "read") {
        openReviewModal(updatedBook);
      }
    } catch (error) {
      console.error("Failed to update reading progress:", error);
      setMoveBookError(
        error.message || "Could not update this reading progress.",
      );
    } finally {
      setProgressBookId("");
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

    try {
      const result = await loadBookDetailsSafely(book, loadProviderBookDetails);
      setSelectedBook(result.details);
      setBookDetailError(result.error);
    } finally {
      setBookDetailLoading(false);
    }
  }

  function closeBookDetails() {
    setSelectedBook(null);
    setBookDetailError("");
    setBookDetailLoading(false);
  }

  function openReviewModal(book) {
    setReviewBook(book);

    const existingReview = book.review;

    setReviewDraft({
      rating: existingReview?.rating ?? 5,
      review: existingReview?.note ?? "",
      visibility: "private",
    });

    setReviewSaveError("");
  }

  function openExistingReview(review) {
    const matchingBook = libraryBooks.find(
      (book) => String(book.bookId) === String(review.bookId),
    );

    setReviewBook({
      ...(matchingBook || {}),
      bookId: review.bookId,
      title: review.book,
      author: review.author,
      isbn: review.isbn,
      coverUrl: review.coverUrl,
      review,
    });

    setReviewDraft({
      rating: review.rating ?? 5,
      review: review.note ?? review.text ?? "",
      visibility: "private",
    });

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
      setReviews((currentReviews) => [
        savedReview,
        ...currentReviews.filter((review) => review.bookId !== savedReview.bookId),
      ]);
      setReviewBook(null);
      setReviewDraft({ rating: 5, review: "", visibility: "private" });
      setReviewPage(0);
    } catch (error) {
      console.error("Failed to save review:", error);
      setReviewSaveError(error.message || "Could not save this review.");
    } finally {
      setReviewSaving(false);
    }
  }

  if (loading || profileLoading) {
    return <p>{t("profile.loadingProfile")}</p>;
  }

  if (!isLoggedIn) {
    return (
      <section className="home-page profile-page" aria-label={t("profile.personal")}>
        <header className="profile-hero">
          <div className="profile-photo" aria-hidden="true">?</div>
          <div>
            <p className="eyebrow">{t("profile.personal")}</p>
            <h1>{t("profile.journal")}</h1>
            <p>{t("profile.loginHelp")}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate("/login")}
            >
              {t("profile.loginSignup")}
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
          <p className="eyebrow">{t("profile.profileError")}</p>
          <h1>{t("profile.loadOwnError")}</h1>
          <p>{profileError}</p>
        </div>
      </section>
    );
  }
  const displayName = getPublicDisplayName(profile);
  const officialName =
    profile?.full_name?.trim() ||
    schoolEmailToOfficialName(user?.email);

  const yearlyGoal = profile?.yearly_goal ?? 40;

  

  const databaseShelves = {
    read: libraryBooks
      .filter((book) => book.shelf === "read")
      .map((book) => ({
        ...book,
        review: reviewsByBookId.get(String(book.bookId)) || null,
      })),    
      "currently-reading": libraryBooks.filter(
      (book) => book.shelf === "currently-reading",
    ),
    "to-be-read": libraryBooks.filter(
      (book) => book.shelf === "to-be-read",
    ),
  };

  const booksRead = databaseShelves.read.length;
  const currentlyReadingBooks = databaseShelves["currently-reading"] || [];
  const progress =
    yearlyGoal > 0
      ? Math.min(Math.round((booksRead / yearlyGoal) * 100), 100)
      : 0;

  const activeShelf = localizedProfileShelves.find(
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
          {t("profile.backProfile")}
        </Link>

        <header className="profile-shelf-page-header">
          <p className="eyebrow">{t("profile.privateLibrary")}</p>
          <h1>{activeShelf.label}</h1>
          <span>{t("profile.shelfCount", { count: books.length })}</span>
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
                <BookCoverImage
                  src={book.coverUrl}
                  alt=""
                  loading="lazy"
                />
                <div className="profile-book-popover">
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                  <p>{book.description || t("profile.noDescription")}</p>
                </div>
              </button>
              <label className="profile-shelf-select">
                <span>{t("profile.moveTo")}</span>
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

                  {localizedProfileShelves.map((shelf) => (
                    <option value={shelf.slug} key={shelf.slug}>
                      {shelf.label}
                    </option>
                    
                  ))}
                  <option value="remove">{t("profile.removeLibrary")}</option>
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
                    {book.review ? t("profile.editReview") : t("profile.addReview")}
                  </button>
                ) : null}
                <button
                  className="profile-remove-book-button"
                  type="button"
                  onClick={() => deleteLibraryBook(book)}
                  disabled={movingBookId === book.shelfEntryId}
                >
                  {movingBookId === book.shelfEntryId
                    ? t("profile.removing")
                    : t("profile.removeLibrary")}
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
    <section className="home-page profile-page" aria-label={t("profile.personal")}>
      <header className="profile-hero">
        <div className="profile-banner">
          <div className="profile-identity">
            <div className="profile-photo profile-photo-main">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={t("profile.profileAlt", { name: displayName })}
                  loading="eager"
                />
              ) : (
                <span className="profile-photo-initial" aria-hidden="true">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="profile-identity-copy">
              <p className="eyebrow">{t("profile.personal")}</p>
              <FittedProfileName>{displayName}</FittedProfileName>
              <div className="profile-meta-row">
                <span>
                  {officialName}
                  {profile?.grade ? ` · G${profile.grade}` : ""}
                </span>
              </div>
              
              {profile?.bio ? (
                <p className="profile-bio">{profile.bio}</p>
              ) : null}

              <button
                className="profile-edit-button"
                type="button"
                onClick={openEditProfile}
              >
                {t("profile.editProfile")}
              </button>
            </div>
          </div>

          <div className="profile-favorites" aria-label={t("profile.fourFavorites")}>
            <p>{t("profile.fourFavorites")}</p>
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
                      <BookCoverImage
                        src={book.coverUrl}
                        alt={t("books.coverAlt", { title: book.title })}
                        decorative
                        loading="eager"
                      />
                    </button>
                  </div>
                ))}
                {selectedFavorites.length < 4 ? (
                  <button
                    className="profile-favorite-add compact"
                    type="button"
                    aria-label={t("profile.addFavorite")}
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
                <strong>{t("profile.addFavorites")}</strong>
                <small>{t("profile.favoritesHelp")}</small>
              </button>
            )}
          </div>
        </div>

        <aside className="profile-challenge" aria-label="2026 reading challenge">
          <span className="profile-challenge-icon">
            <TrophyIcon />
          </span>
          <p className="eyebrow">{t("profile.readingChallenge", { year: new Date().getFullYear() })}</p>
          <h2>{booksRead} / {yearlyGoal}</h2>
          <span>{t("profile.booksCompleted")}</span>
          <div className="profile-progress" aria-label={`${progress}% complete`}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>{t("profile.goalProgress", { progress })}</small>
        </aside>
      </header>

      <section className="profile-reading-tracker" aria-label={t("profile.tracker")}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("profile.tracker")}</p>
            <h2>{t("profile.openNow")}</h2>
          </div>
        </div>

        {currentlyReadingBooks.length > 0 ? (
          <div className="profile-tracker-list">
            {currentlyReadingBooks.map((book) => (
              <article className="profile-tracker-book" key={book.shelfEntryId}>
                <button
                  className="profile-tracker-cover"
                  type="button"
                  onClick={() => openBookDetails(book)}
                  aria-label={`Open details for ${book.title}`}
                >
                  <BookCoverImage
                    src={book.coverUrl}
                    alt=""
                  />
                </button>

                <div className="profile-tracker-copy">
                  <small>{book.author || t("common.unknownAuthor")}</small>
                  <strong>{book.title}</strong>
                  <div className="profile-tracker-progress">
                    <div
                      className="profile-progress"
                      aria-label={`${book.progress}% complete`}
                    >
                      <i style={{ width: `${book.progress}%` }} />
                    </div>
                    <span>{book.progress}%</span>
                  </div>
                </div>

                <label className="profile-tracker-input">
                  <span>{t("search.read")}</span>
                  <input
                    type="number"
                    min="0"
                    max={book.totalPages || undefined}
                    value={book.pagesRead ?? 0}
                    disabled={progressBookId === book.shelfEntryId}
                    onChange={(event) =>
                      changeBookProgress(book, "pagesRead", event.target.value)
                    }
                  />
                  <small>{t("profile.pageAbbr")}</small>
                </label>

                <label className="profile-tracker-input">
                  <span>{t("home.total")}</span>
                  <input
                    type="number"
                    min="1"
                    value={book.totalPages ?? ""}
                    placeholder={t("home.total")}
                    disabled={progressBookId === book.shelfEntryId}
                    onChange={(event) =>
                      changeBookProgress(book, "totalPages", event.target.value)
                    }
                  />
                  <small>{t("profile.pageAbbr")}</small>
                </label>
              </article>
            ))}
          </div>
        ) : (
          <p className="profile-empty">{t("home.noOpenBooks")}</p>
        )}
      </section>

      <section className="profile-shelf-overview" aria-label={t("profile.personalShelves")}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("profile.privateLibrary")}</p>
            <h2>{t("profile.yourShelves")}</h2>
          </div>
        </div>

        <div className="profile-shelf-grid">
          {localizedProfileShelves.map((shelf) => (
            <Link
              className={`profile-shelf-card ${shelf.tone}`}
              to={`/profile/shelves/${shelf.slug}`}
              key={shelf.label}
            >
              <span>{shelf.label}</span>
              <strong>{t("profile.shelfBooks", { count: databaseShelves[shelf.slug]?.length || 0 })}</strong>
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

      <section className="profile-reviews" aria-label={t("profile.ratingsReviews")}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("home.readingNotes")}</p>
            <h2>{t("profile.ratingsReviews")}</h2>
          </div>
        </div>

        <div className="profile-review-list">
          {reviewsLoading ? (
            <p className="profile-empty">{t("profile.loadingReviews")}</p>
          ) : reviewsError ? (
            <p className="profile-save-error">{reviewsError}</p>
          ) : visibleReviews.length > 0 ? (
            visibleReviews.map((review) => (
              <button
                className="profile-review profile-review-button"
                type="button"
                key={review.id || review.bookId}
                onClick={() => openExistingReview(review)}
                aria-label={`View or edit your review of ${review.book}`}
              >
                <div className="profile-review-media">
                  <BookCoverImage
                    src={review.coverUrl}
                    alt=""
                    loading="lazy"
                  />

                  {review.rating == null ? (
                    <div
                      className="profile-review-stars profile-review-note-label"
                      aria-label={t("profile.privateNote")}
                    >
                      Note
                    </div>
                  ) : (
                    <div
                      className="profile-review-stars"
                      aria-label={`${review.rating} out of 5 open books`}
                    >
                      <StarRating rating={review.rating} />
                    </div>
                  )}
                </div>

                <section>
                  <p>{review.author}</p>
                  <h3>{review.book}</h3>
                  <strong>
                    {review.rating == null ? t("profile.privateNote") : `${review.rating}/5`}
                  </strong>
                  <small>{review.note}</small>
                </section>
              </button>
            ))
          ) : (
            <p className="profile-empty">
              {t("profile.noReviews")}
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
              {t("common.previous")}
            </button>
            <span>
              {t("home.pageOf", { page: reviewPage + 1, count: reviewPageCount })}
            </span>
            <button
              type="button"
              disabled={reviewPage >= reviewPageCount - 1}
              onClick={() =>
                setReviewPage((page) => Math.min(page + 1, reviewPageCount - 1))
              }
            >
              {t("common.next")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="profile-clubs" aria-label={t("profile.yourClubs")}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("profile.readingCircles")}</p>
            <h2>{t("profile.yourClubs")}</h2>
          </div>
          <Link className="ghost-button" to="/clubs">
            {t("profile.browseClubs")}
          </Link>
        </div>

        {clubsLoading ? (
  <p className="profile-empty">
    {t("profile.loadingClubs")}
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
          <BookCoverImage
            src={club.coverUrl}
            alt=""
            loading="lazy"
          />
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
    {t("profile.noClubs")}
  </p>
)}
      </section>
      {isEditProfileOpen ? (
        <div
          className="composer-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !profileSaving &&
              !avatarUploading
            ) {
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
              aria-label={t("profile.closeEditor")}
              disabled={profileSaving || avatarUploading}
              onClick={() => {
                if (!avatarUploading) {
                  setIsEditProfileOpen(false);
                }
              }}
            >
              ×
            </button>

            <p className="eyebrow">{t("profile.personal")}</p>
            <h2 id="profile-edit-title">{t("profile.editTitle")}</h2>

            <form onSubmit={saveProfile}>
              <div className="profile-avatar-editor">
                <span className="profile-avatar-editor-label">
                  {t("profile.avatar")}
                </span>

                <div className="profile-avatar-editor-row">
                  <div className="profile-photo profile-photo-preview">
                    {avatarPreview || profile?.avatar_url ? (
                      <img
                        src={avatarPreview || profile.avatar_url}
                        alt={t("profile.preview")}
                      />
                    ) : (
                      <span className="profile-photo-initial" aria-hidden="true">
                        {(profileDraft.username || displayName)
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="profile-avatar-controls">
                    <label className="profile-avatar-file-button">
                      <span>
                        {avatarUploading ? t("profile.uploading") : t("profile.choosePhoto")}
                      </span>

                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={selectAvatarFile}
                        disabled={avatarUploading || profileSaving}
                      />
                    </label>

                    <small>
                      {avatarUploading
                        ? t("profile.uploadingHelp")
                        : t("profile.uploadHelp")}
                    </small>
                  </div>
                </div>

                {avatarUploadError ? (
                  <p className="profile-save-error" role="alert">
                    {avatarUploadError}
                  </p>
                ) : null}
              </div>
              <label>
                <span>{t("profile.username")}</span>
                <input
                  type="text"
                  value={profileDraft.username}
                  onChange={(event) =>
                    setProfileDraft((currentDraft) => ({
                      ...currentDraft,
                      username: event.target.value,
                    }))
                  }
                  placeholder={t("profile.usernamePlaceholder")}
                  disabled={profileSaving}
                />
                <small
                  className={
                    usernameCharactersOverLimit > 0
                      ? "profile-field-warning"
                      : ""
                  }
                >
                  {usernameCharactersOverLimit > 0
                    ? `${usernameCharactersOverLimit} character${
                        usernameCharactersOverLimit === 1 ? "" : "s"
                      } over the 20-character limit. Please shorten it.`
                    : `${usernameCharacterCount}/${USERNAME_CHARACTER_LIMIT} characters. This is the name other readers will see.`}
                </small>
              </label>

             <div className="profile-readonly-row">
              <label>
                <span>{t("profile.fullName")}</span>

                <input
                  className="profile-readonly-input"
                  type="text"
                  value={officialName}
                  readOnly
                />

                <small>{t("profile.readonlyName")}</small>
              </label>

              <label>
                <span>{t("profile.grade")}</span>

                <input
                  className="profile-readonly-input"
                  type="text"
                  value={
                    profile?.grade
                      ? `Grade ${profile.grade}`
                      : t("profile.unavailableValue")
                  }
                  readOnly
                />

                <small>{t("profile.automatic")}</small>
              </label>
            </div>
              <label>
                <span>{t("profile.bio")}</span>
                <textarea
                  value={profileDraft.bio}
                  onChange={(event) =>
                    setProfileDraft((currentDraft) => ({
                      ...currentDraft,
                      bio: event.target.value,
                    }))
                  }
                  placeholder={t("profile.bioPlaceholder")}
                  rows="4"
                  maxLength="300"
                  disabled={profileSaving}
                />
                <small>{profileDraft.bio.length}/300</small>
              </label>

              <label>
                <span>{t("profile.yearlyGoal", { year: new Date().getFullYear() })}</span>
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
                disabled={profileSaving || avatarUploading}
              >
                {avatarUploading
                  ? t("profile.uploadingPhoto")
                  : profileSaving
                    ? t("profile.saving")
                    : t("profile.saveProfile")}
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
              aria-label={t("profile.closeFavorites")}
              onClick={() => setIsFavoritePickerOpen(false)}
            >
              x
            </button>
            <p className="eyebrow">{t("profile.fourFavorites")}</p>
            <h2 id="favorite-picker-title">{t("profile.addFavoriteTitle")}</h2>
            <label>
              <span>{t("profile.searchBooks")}</span>
              <input
                type="search"
                value={favoriteSearch}
                onChange={(event) => setFavoriteSearch(event.target.value)}
                placeholder={t("search.placeholder")}
              />
            </label>
            <div className="favorite-picker-results">
              {filteredFavoriteOptions.slice(0, 6).map((book) => (
                <button
                  type="button"
                  key={book.bookId || book.isbn}
                  onClick={() => addFavoriteBook(book)}
                >
                  <BookCoverImage
                    src={book.coverUrl}
                    alt={t("books.coverAlt", { title: book.title })}
                    decorative
                    loading="lazy"
                  />

                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.author}</small>
                  </span>
                </button>
              ))}
              {filteredFavoriteOptions.length === 0 ? (
                <p className="profile-empty">
                  {libraryBooks.length === 0
                    ? t("profile.addBooksFirst")
                    : t("profile.noLibraryMatch")}
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
