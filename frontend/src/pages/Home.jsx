import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { bookDatabasePreview } from "../data/books";
import { useRequireLogin } from "../hooks/useRequireLogin";
import { useAuth } from "../hooks/useAuth";
import {
  addBookToLibrary,
  getUserLibrary,
  updateLibraryBookProgress,
} from "../lib/libraryApi";
import {
  addPostComment,
  createPost,
  deletePost,
  deletePostComment,
  getFeedPosts,
  likeComment,
  likePost,
  unlikeComment,
  unlikePost,
} from "../lib/postApi";
import { savePrivateBookNote, saveReview } from "../lib/reviewApi";
import BookDetailModal from "../components/BookDetailModal";
import { getPreferredGoogleBooksCoverUrl } from "../lib/googleBooks";
import { loadBookDetailsSafely, loadProviderBookDetails } from "../lib/bookDetails";
import StarRating, { RatingPicker } from "../components/StarRating";
import UserAvatar from "../components/UserAvatar";
import {
  getGradeLeaderboard,
  getTeacherLeaderboard,
} from "../lib/leaderboardApi";
import ProfileLink from "../components/ProfileLink";
import ModerationWarningCard from "../components/ModerationWarningCard";
import ModerationStatusBar from "../components/ModerationStatusBar";
import ModerationBlockedCard from "../components/ModerationBlockedCard";
import { resolveSocialTarget } from "../lib/socialTargets";
import RecoveringBookCoverImage from "../components/RecoveringBookCoverImage";
import HomepageSpotlightCarousel from "../components/HomepageSpotlightCarousel";
import BookCoverImage from "../components/BookCoverImage";
import BookCoverPlaceholder from "../components/BookCoverPlaceholder";
import { formatFeedRelativeTime } from "../lib/feedPresentation.js";

const STORAGE_KEY = "litshelf-home-state-v1";
const PROFILE_REVIEWS_KEY = "litshelf-profile-reviews-v1";
const PRIVATE_NOTES_KEY = "litshelf-private-reading-notes-v1";
const FEED_PAGE_SIZE = 15;
const defaultTrackedBook = {
  title: "Bluets",
  author: "Maggie Nelson",
  isbn: "9781933517407",
  progress: 34,
  finished: false,
};

function HeartIcon({ filled = false }) {
  return (
    <svg
      aria-hidden="true"
      className="social-action-icon"
      fill={filled ? "currentColor" : "none"}
      viewBox="0 0 24 24"
    >
      <path
        d="M20.8 4.7c-2.1-2-5.4-1.9-7.4.2L12 6.3l-1.4-1.4C8.6 2.8 5.3 2.7 3.2 4.7 1 6.8 1 10.3 3.2 12.5l7.7 7.5c.6.6 1.6.6 2.2 0l7.7-7.5c2.2-2.2 2.2-5.7 0-7.8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      aria-hidden="true"
      className="social-action-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M20.2 11.7c0 4.1-3.5 7.4-8.2 7.4-1 0-2-.2-2.9-.5L4 20l1.4-4.1a6.9 6.9 0 0 1-1.6-4.3c0-4.1 3.5-7.4 8.2-7.4s8.2 3.3 8.2 7.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="comment-reply-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M9.2 8.2 5 12.3l4.2 4.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M5.6 12.3h8.1c3 0 5.1 1.6 5.9 4.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

const dailyLiteraryQuotes = [
  {
    quote: "We tell ourselves stories in order to live.",
    author: "Joan Didion",
    source: "The White Album",
    note: "For rainy windows, annotated margins, and the first quiet thought of the day.",
  },
  {
    quote: "I am, I am, I am.",
    author: "Sylvia Plath",
    source: "The Bell Jar",
    note: "A small pulse from the reading room before the feed begins.",
  },
  {
    quote: "The only way out is through.",
    author: "Robert Frost",
    source: "A Servant to Servants",
    note: "For pages read between classes and trains taken somewhere softer.",
  },
  {
    quote: "I have measured out my life with coffee spoons.",
    author: "T. S. Eliot",
    source: "The Love Song of J. Alfred Prufrock",
    note: "A sentence for cafe tables, library stacks, and half-finished chapters.",
  },
  {
    quote: "There is no friend as loyal as a book.",
    author: "Ernest Hemingway",
    source: "commonly attributed",
    note: "For the paperback that stays in your bag all week.",
  },
  {
    quote: "I was within and without, simultaneously enchanted and repelled.",
    author: "F. Scott Fitzgerald",
    source: "The Great Gatsby",
    note: "For city nights, classroom conversations, and complicated favorite characters.",
  },
  {
    quote: "Time is the longest distance between two places.",
    author: "Tennessee Williams",
    source: "The Glass Menagerie",
    note: "For books that make the room feel wider than it is.",
  },
];

function saveProfileReview(review) {
  try {
    const savedReviews = JSON.parse(localStorage.getItem(PROFILE_REVIEWS_KEY));
    const reviews = Array.isArray(savedReviews) ? savedReviews : [];
    localStorage.setItem(PROFILE_REVIEWS_KEY, JSON.stringify([review, ...reviews]));
  } catch {
    localStorage.setItem(PROFILE_REVIEWS_KEY, JSON.stringify([review]));
  }
}

function savePrivateReadingNote({ userId, book, note, hasSpoilers }) {
  try {
    const savedNotes = JSON.parse(localStorage.getItem(PRIVATE_NOTES_KEY));
    const notes = Array.isArray(savedNotes) ? savedNotes : [];

    localStorage.setItem(
      PRIVATE_NOTES_KEY,
      JSON.stringify([
        {
          id: crypto.randomUUID?.() || `${Date.now()}`,
          userId,
          bookId: book?.bookId || null,
          title: book?.title || "",
          author: book?.author || "",
          isbn: book?.isbn || "",
          coverUrl: book ? getBookCoverSource(book) : "",
          note,
          hasSpoilers,
          visibility: "private",
          createdAt: new Date().toISOString(),
        },
        ...notes,
      ]),
    );
  } catch {
    localStorage.setItem(PRIVATE_NOTES_KEY, JSON.stringify([]));
  }
}
function mapLibraryBookToTrackedBook(book) {
  return {
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    coverUrl: book.coverUrl,
    progress: Number(book.progress) || 0,
    pagesRead: Number(book.pagesRead) || 0,
    totalPages: book.totalPages || "",
    finished: false,
    shelfEntryId: book.shelfEntryId,
    bookId: book.bookId,
  };
}

function getTrackedBookKey(book) {
  return book?.shelfEntryId || book?.isbn || book?.title;
}

function getShelfLabel(shelf, t) {
  switch (shelf) {
    case "currently-reading":
      return t("books.currentlyReading");
    case "read":
      return t("search.read");
    case "to-be-read":
      return t("search.toBeRead");
    default:
      return t("books.myShelf");
  }
}

function getBookCoverSource(book) {
  if (!book) return "";

  return getPreferredGoogleBooksCoverUrl(book.coverUrl);
}

function getDailyLiteraryQuote(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);

  return dailyLiteraryQuotes[dayOfYear % dailyLiteraryQuotes.length];
}

function normalizeTrackedBook(book) {
  if (Object.prototype.hasOwnProperty.call(book, "progress")) {
    return {
      ...book,
      progress: Math.max(0, Math.min(Number(book.progress) || 0, 100)),
      pagesRead: Number(book.pagesRead) || 0,
      totalPages: book.totalPages || "",
    };
  }

  const legacyProgress = book.totalPages
    ? Math.round(((Number(book.pagesRead) || 0) / Number(book.totalPages)) * 100)
    : 0;

  return {
    ...book,
    progress: Math.max(0, Math.min(legacyProgress, 100)),
    pagesRead: Number(book.pagesRead) || 0,
    totalPages: book.totalPages || "",
  };
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

function SpoilerSegment({ text }) {
  const { t } = useTranslation();
  const [isRevealed, setIsRevealed] =
    useState(false);

  if (isRevealed) {
    return (
      <span className="spoiler-revealed-text">
        {text}
      </span>
    );
  }

  return (
    <button
      className="spoiler-redaction"
      type="button"
      aria-label={t("home.revealSpoiler")}
      onClick={() => setIsRevealed(true)}
    >
      <span className="spoiler-hidden-text">
        {text}
      </span>
    </button>
  );
}

function renderSpoilerText(text) {
  const parts = String(text || "").split(/(\|\|[\s\S]+?\|\|)/g);

  return parts.map((part, index) => {
    const isSpoiler =
      part.startsWith("||") && part.endsWith("||");

    if (!isSpoiler) {
      return part;
    }

    const spoilerText = part.slice(2, -2);

    return (
      <SpoilerSegment
        key={`${spoilerText}-${index}`}
        text={spoilerText}
      />
    );
  });
}

function getFeedCompressionKey(posts) {
  if (!posts?.length) return "";
  const firstPost = posts[0];
  const lastPost = posts[posts.length - 1];

  return [
    firstPost.userId || "reader",
    firstPost.id,
    lastPost.id,
    posts.length,
  ].join(":");
}

function buildCompressedFeedEntries({
  posts = [],
  expandedBundleKeys = new Set(),
  targetPostId = "",
}) {
  const entries = [];
  let index = 0;
  const targetId = String(targetPostId || "");

  while (index < posts.length) {
    const firstPost = posts[index];
    const run = [firstPost];
    let nextIndex = index + 1;

    while (
      nextIndex < posts.length &&
      posts[nextIndex].userId === firstPost.userId
    ) {
      run.push(posts[nextIndex]);
      nextIndex += 1;
    }

    const bundleKey = getFeedCompressionKey(run);
    const containsTargetPost = targetId &&
      run.some((post) => String(post.id) === targetId);

    if (run.length > 5 && expandedBundleKeys.has(bundleKey)) {
      run.forEach((post) =>
        entries.push({
          type: "post",
          key: String(post.id),
          post,
        }),
      );
      entries.push({
        type: "bundle-control",
        key: bundleKey,
        userId: firstPost.userId,
        userName: firstPost.student,
        hiddenCount: run.length - 1,
        expanded: true,
      });
    } else if (
      run.length > 5 &&
      !containsTargetPost
    ) {
      entries.push({
        type: "post",
        key: String(firstPost.id),
        post: firstPost,
      });
      entries.push({
        type: "bundle-control",
        key: bundleKey,
        userId: firstPost.userId,
        userName: firstPost.student,
        hiddenCount: run.length - 1,
        expanded: false,
      });
    } else {
      run.forEach((post) =>
        entries.push({
          type: "post",
          key: String(post.id),
          post,
        }),
      );
    }

    index = nextIndex;
  }

  return entries;
}

function Home() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { postId: routePostId } = useParams();
  const notificationTargetHandledRef = useRef("");
  const navigate = useNavigate();
  const [initialHomeState] = useState(getInitialHomeState);
  const [dailyQuote] = useState(() => getDailyLiteraryQuote());
  const { requireLogin, isLoggedIn } = useRequireLogin();
  const { user } = useAuth();
  const [selectedBook, setSelectedBook] = useState(null);
  const [bookDetailLoading, setBookDetailLoading] = useState(false);
  const [bookDetailError, setBookDetailError] = useState(""); 
  const [modalShelf, setModalShelf] = useState("to-be-read");
  const [addingBook, setAddingBook] = useState(false);
  const [bookAdded, setBookAdded] = useState(false);
  const [posts, setPosts] = useState([]);
  const [feedPage, setFeedPage] = useState(1);
  const [feedTotalCount, setFeedTotalCount] = useState(0);
  const [feedSearchDraft, setFeedSearchDraft] = useState("");
  const [feedSearchQuery, setFeedSearchQuery] = useState("");
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [expandedFeedBundleKeys, setExpandedFeedBundleKeys] =
    useState(() => new Set());
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [
    expandedCommentPostIds,
    setExpandedCommentPostIds,
  ] = useState(() => new Set());

  const commentInputRefs = useRef({});
  const [deletePostError, setDeletePostError] = useState("");
  const [gradeLeaderboard, setGradeLeaderboard] = useState([]);
  const [teacherBooksRead, setTeacherBooksRead] = useState(0);  
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState("");

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
    visibility: "private",
  });
  const [finishReviewSaving, setFinishReviewSaving] = useState(false);
  const [finishReviewError, setFinishReviewError] = useState("");
  const [composeDraft, setComposeDraft] = useState({
    bookId: "",
    note: "",
    hasSpoilers: false,
    shareToFeed: false,
  });
  const composerTextareaRef = useRef(null);
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [
    commentModeratingPostId,
    setCommentModeratingPostId,
  ] = useState(null);
  const [publishingNote, setPublishingNote] =
    useState(false);

  const [moderationConfirming, setModerationConfirming] =
    useState(false);
  const [moderationWarning, setModerationWarning] =
    useState(null);
  const [moderationBlocked, setModerationBlocked] =
    useState(null);
  const [publishNoteError, setPublishNoteError] = useState("");
  const selectedComposerBook = libraryBooks.find(
    (book) => String(book.bookId) === String(composeDraft.bookId),
  );
  const [commentReplyTargets, setCommentReplyTargets] =
    useState({});
  const socialTarget = resolveSocialTarget({
    pathname: routePostId ? `/post/${routePostId}` : location.pathname,
    search: location.search,
  });
  const targetPostId = socialTarget?.postId || "";
  const targetCommentId = socialTarget?.commentId || "";
  const targetReplyId = socialTarget?.replyId || "";
  const feedEntries = useMemo(
    () => buildCompressedFeedEntries({
      posts,
      expandedBundleKeys: expandedFeedBundleKeys,
      targetPostId,
    }),
    [expandedFeedBundleKeys, posts, targetPostId],
  );

  function expandFeedBundle(bundleKey) {
    setExpandedFeedBundleKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      nextKeys.add(bundleKey);
      return nextKeys;
    });
  }

  function collapseFeedBundle(bundleKey) {
    setExpandedFeedBundleKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      nextKeys.delete(bundleKey);
      return nextKeys;
    });
  }

  function addPostToFeedPage(createdPost) {
    if (!createdPost) return;

    const normalizedFeedSearch = feedSearchQuery
      .trim()
      .toLocaleLowerCase();

    if (
      normalizedFeedSearch &&
      !String(createdPost.book || createdPost.title || "")
        .toLocaleLowerCase()
        .includes(normalizedFeedSearch)
    ) {
      return;
    }

    setFeedTotalCount((count) => count + 1);
    setFeedPage(1);
    setPosts((currentPosts) => [
      createdPost,
      ...currentPosts,
    ].slice(0, FEED_PAGE_SIZE));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadGradeLeaderboard() {
      setLeaderboardLoading(true);
      setLeaderboardError("");

      const errors = [];

      try {
        const gradeRankings = await getGradeLeaderboard();

        if (!cancelled) {
          setGradeLeaderboard(gradeRankings);
        }
      } catch (error) {
        console.error("Failed to load grade leaderboard:", error);
        errors.push(error);

        if (!cancelled) {
          setGradeLeaderboard([]);
        }
      }

      try {
        const teacherTotal = await getTeacherLeaderboard();

        if (!cancelled) {
          setTeacherBooksRead(teacherTotal);
        }
      } catch (error) {
        console.error("Failed to load teacher leaderboard:", error);
        errors.push(error);

        if (!cancelled) {
          setTeacherBooksRead(0);
        }
      } finally {
        if (!cancelled) {
          setLeaderboardError(
            errors.length === 2
              ? errors[0]?.message || "Could not load the reading leaderboards."
              : "",
          );
          setLeaderboardLoading(false);
        }
      }
    }

    loadGradeLeaderboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFeedPage(1);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      setFeedLoading(true);
      setFeedError("");

      try {
        const loadedFeed = await getFeedPosts(user?.id || null, {
          page: feedPage,
          pageSize: FEED_PAGE_SIZE,
          bookTitleQuery: feedSearchQuery,
        });

        if (!cancelled) {
          setPosts(loadedFeed.posts);
          setFeedTotalCount(loadedFeed.totalCount);
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
  }, [feedPage, feedSearchQuery, user?.id]);

  function searchFeedPosts(event) {
    event.preventDefault();
    setFeedSearchQuery(feedSearchDraft.trim());
    setFeedPage(1);
  }

  function clearFeedPostSearch() {
    setFeedSearchDraft("");
    setFeedSearchQuery("");
    setFeedPage(1);
  }

  useEffect(() => {
    if (feedLoading || !targetPostId) return undefined;
    const targetKey = `${targetPostId}:${targetCommentId}:${targetReplyId}`;
    if (notificationTargetHandledRef.current === targetKey) return undefined;
    const targetPost = posts.find((post) => String(post.id) === targetPostId);
    if (!targetPost) {
      // Deleted or unavailable content is a safe no-op.
      notificationTargetHandledRef.current = targetKey;
      return undefined;
    }
    const requestedContentId = targetReplyId || targetCommentId;
    const requestedContent = requestedContentId
      ? targetPost.comments.find((comment) => String(comment.id) === requestedContentId)
      : null;
    if (requestedContentId) {
      if (!expandedCommentPostIds.has(targetPost.id)) {
        // Revealing a folded target is part of synchronizing the URL with the rendered feed.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExpandedCommentPostIds((current) => new Set(current).add(targetPost.id));
        return undefined;
      }
    }

    let highlightTimer;
    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(
        requestedContent
          ? `${requestedContent.isReply ? "reply" : "comment"}-${requestedContent.id}`
          : targetCommentId && document.getElementById(`comment-${targetCommentId}`)
            ? `comment-${targetCommentId}`
            : `feed-post-${targetPostId}`,
      );
      if (!element) return;
      notificationTargetHandledRef.current = targetKey;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      element.focus({ preventScroll: true });
      element.classList.add("notification-content-target");
      highlightTimer = window.setTimeout(() => {
        element.classList.remove("notification-content-target");
      }, reducedMotion ? 0 : 2200);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (highlightTimer) window.clearTimeout(highlightTimer);
    };
  }, [feedLoading, posts, expandedCommentPostIds, targetPostId, targetCommentId, targetReplyId]);

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
          setComposeDraft((currentDraft) => ({
            ...currentDraft,
            bookId:
              currentDraft.bookId && books.some(
                (book) => String(book.bookId) === String(currentDraft.bookId),
              )
                ? currentDraft.bookId
                : String(books[0]?.bookId || ""),
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

  async function toggleCommentLike(postId, commentId) {
    if (!requireLogin()) return;
    if (!user?.id) return;

    const post = posts.find((currentPost) => currentPost.id === postId);
    const comment = post?.comments.find(
      (currentComment) => currentComment.id === commentId,
    );

    if (!comment) return;

    const nextLiked = !comment.liked;
    const nextLikes = Math.max(
      comment.likes + (comment.liked ? -1 : 1),
      0,
    );

    setPosts((currentPosts) =>
      currentPosts.map((currentPost) =>
        currentPost.id !== postId
          ? currentPost
          : {
              ...currentPost,
              comments: currentPost.comments.map((currentComment) =>
                currentComment.id !== commentId
                  ? currentComment
                  : {
                      ...currentComment,
                      liked: nextLiked,
                      likes: nextLikes,
                    },
              ),
            },
      ),
    );

    try {
      if (comment.liked) {
        await unlikeComment({
          commentId,
          userId: user.id,
        });
      } else {
        await likeComment({
          commentId,
          userId: user.id,
        });
      }
    } catch (error) {
      console.error("Failed to update comment like:", error);
      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id !== postId
            ? currentPost
            : {
                ...currentPost,
                comments: currentPost.comments.map((currentComment) =>
                  currentComment.id !== commentId
                    ? currentComment
                    : {
                        ...currentComment,
                        liked: comment.liked,
                        likes: comment.likes,
                      },
                ),
              },
        ),
      );
    }
  }

  async function removePost(postId) {
    if (!requireLogin() || !user?.id) return;

    const post = posts.find((currentPost) => currentPost.id === postId);

    if (!post || post.userId !== user.id) return;
    if (!window.confirm("Delete this reading note? This cannot be undone.")) return;

    setDeletingPostId(postId);
    setDeletePostError("");

    try {
      await deletePost(postId, user.id);
      setPosts((currentPosts) =>
        currentPosts.filter((currentPost) => currentPost.id !== postId),
      );
      setFeedTotalCount((count) => Math.max(count - 1, 0));
      if (posts.length === 1 && feedPage > 1) {
        setFeedPage((page) => Math.max(page - 1, 1));
      }
    } catch (error) {
      console.error("Failed to delete reading note:", error);
      setDeletePostError(error.message || "Could not delete your reading note.");
    } finally {
      setDeletingPostId(null);
    }
  }

  function updateDraft(postId, value) {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId ? { ...post, draftComment: value } : post,
      ),
    );
  }
  function toggleComments(postId) {
    setExpandedCommentPostIds((current) => {
      const next = new Set(current);

      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }

      return next;
    });
  }

  function focusCommentInput(postId) {
    window.requestAnimationFrame(() => {
      commentInputRefs.current[postId]?.focus();
    });
  }

  function beginCommentReply({
    postId,
    commentId,
    userId,
    username,
    commenterName,
  }) {
    if (!requireLogin()) {
      return;
    }

    setCommentReplyTargets((current) => ({
      ...current,
      [postId]: {
        commentId,
        userId,
        username:
          String(username || "")
            .trim()
            .replace(/^@/, ""),
        name:
          String(
            commenterName || "Reader",
          ).trim(),
      },
    }));

    focusCommentInput(postId);
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

    try {
      const result = await loadBookDetailsSafely(book, loadProviderBookDetails);
      setSelectedBook(result.details);
      setBookDetailError(result.error);
    } finally {
      setBookDetailLoading(false);
    }
  }
  async function addComment(postId) {
    if (!requireLogin()) return;
    if (!user?.id) return;

    if (commentModeratingPostId !== null) {
      return;
    }

    const post = posts.find(
      (currentPost) =>
        currentPost.id === postId,
    );
    
    if (!post) return;
    const replyTarget =
      commentReplyTargets[postId] || null;

    const comment = post.draftComment.trim();

    if (!comment) return;

    setModerationWarning(null);
    setModerationBlocked(null);
    setDeletePostError("");
    setCommentModeratingPostId(postId);

    try {
      const createdComment =
        await addPostComment({
          postId,
          userId: user.id,
          comment,
          mentionedUserId:
            replyTarget?.userId || null,
          parentCommentId:
            replyTarget?.commentId || null,
          allowModerationWarning: false,
        });

      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id !== postId
            ? currentPost
            : {
                ...currentPost,
                comments: [
                  ...currentPost.comments,
                  createdComment,
                ],
                draftComment: "",
              },
        ),
      );
      setCommentReplyTargets((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
    } catch (error) {
      console.error(
        "Failed to publish comment:",
        error,
      );

      if (error.code === "MODERATION_WARNING") {
        setModerationWarning({
          type: "feed-comment",
          postId,
          text: comment,
          mentionedUserId:
            replyTarget?.userId || null,
          parentCommentId:
            replyTarget?.commentId || null,
          message: error.message,
        });

        return;
      }

      if (error.code === "MODERATION_BLOCK") {
        setModerationBlocked({
          type: "feed-comment",
          postId,
          level: "block",
          message: error.message,
        });

        return;
      }

      if (error.code === "MODERATION_REPORT") {
        setModerationBlocked({
          type: "feed-comment",
          postId,
          level: "report",
          message: error.message,
        });

        return;
      }

      setDeletePostError(
        error.message ||
          "Could not publish your comment.",
      );
    } finally {
      setCommentModeratingPostId(null);
    }
  }
  async function confirmWarnedFeedComment() {
    if (
      moderationWarning?.type !== "feed-comment" ||
      !moderationWarning.postId ||
      !user?.id
    ) {
      return;
    }

    const {
      postId,
      text,
      mentionedUserId,
      parentCommentId,
    } = moderationWarning;

    setModerationConfirming(true);
    setDeletePostError("");

    try {
      const createdComment =
        await addPostComment({
          postId,
          userId: user.id,
          comment: text,
          mentionedUserId:
            mentionedUserId || null,
          parentCommentId:
            parentCommentId || null,
          allowModerationWarning: true,
        });

      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id !== postId
            ? currentPost
            : {
                ...currentPost,
                comments: [
                  ...currentPost.comments,
                  createdComment,
                ],
                draftComment: "",
              },
        ),
      );

      setCommentReplyTargets((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });

      setModerationWarning(null);
    } catch (error) {
      console.error(
        "Failed to publish warned comment:",
        error,
      );

      if (error.code === "MODERATION_BLOCK") {
        setModerationWarning(null);
        setModerationBlocked({
          type: "feed-comment",
          postId,
          level: "block",
          message: error.message,
        });
        return;
      }

      if (error.code === "MODERATION_REPORT") {
        setModerationWarning(null);
        setModerationBlocked({
          type: "feed-comment",
          postId,
          level: "report",
          message: error.message,
        });
        return;
      }

      setDeletePostError(
        error.message ||
          "Could not publish your comment.",
      );
    } finally {
      setModerationConfirming(false);
    }
  }
  async function removeComment(postId, commentId) {
    if (!requireLogin() || !user?.id) return;

    const post = posts.find((currentPost) => currentPost.id === postId);
    const comment = post?.comments.find(
      (currentComment) => currentComment.id === commentId,
    );

    if (!comment || comment.userId !== user.id) return;
    if (!window.confirm("Delete this comment?")) return;

    setDeletingCommentId(commentId);
    setDeletePostError("");

    try {
      await deletePostComment(commentId, user.id);
      setPosts((currentPosts) =>
        currentPosts.map((currentPost) =>
          currentPost.id !== postId
            ? currentPost
            : {
                ...currentPost,
                comments: currentPost.comments.filter(
                  (currentComment) => currentComment.id !== commentId,
                ),
              },
        ),
      );
    } catch (error) {
      console.error("Failed to delete comment:", error);
      setDeletePostError(error.message || "Could not delete your comment.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  function openComposer(bookId = null) {
    if (!requireLogin()) return;

    setPublishNoteError("");

    setComposeDraft((currentDraft) => ({
      ...currentDraft,
      bookId: bookId
        ? String(bookId)
        : currentDraft.bookId || String(libraryBooks[0]?.bookId || ""),
    }));

    setIsComposerOpen(true);
  }

  function closeComposer() {
    setModerationWarning(null);
    setModerationBlocked(null);
    setIsComposerOpen(false);
  }

  function markSelectedTextAsSpoiler() {
    const textarea = composerTextareaRef.current;

    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd, value } =
      textarea;
    const selectedText = value.slice(selectionStart, selectionEnd);

    if (!selectedText.trim()) {
      setPublishNoteError(
        "Highlight the spoiler text in your note first.",
      );
      textarea.focus();
      return;
    }

    const nextNote = `${value.slice(0, selectionStart)}||${selectedText}||${value.slice(selectionEnd)}`;

    setComposeDraft((draft) => ({
      ...draft,
      note: nextNote,
      hasSpoilers: true,
    }));
    setPublishNoteError("");

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectionStart,
        selectionEnd + 4,
      );
    });
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
      pagesRead: 0,
      totalPages: "",
      finished: false,
      coverUrl: "",
    };

    try {
      const savedLibraryBook = await addBookToLibrary(
        user.id,
        {
          title: selectedBook.title,
          author: selectedBook.author,
          isbn: selectedBook.isbn,
          coverUrl: "",
        },
        "currently-reading",
      );

      const savedTrackedBook = {
        ...nextTrackedBook,
        shelfEntryId: savedLibraryBook.shelf.id,
        bookId: savedLibraryBook.book.id,
      };
      const savedLibraryEntry = {
        shelfEntryId: savedLibraryBook.shelf.id,
        bookId: savedLibraryBook.book.id,
        shelf: savedLibraryBook.shelf.shelf,
        progress:
          savedLibraryBook.shelf.shelf === "read"
            ? 100
            : savedLibraryBook.shelf.progress ?? 0,
        pagesRead: savedLibraryBook.shelf.pages_read ?? 0,
        totalPages: savedLibraryBook.shelf.total_pages ?? "",
        rating: savedLibraryBook.shelf.rating,
        title: savedLibraryBook.book.title,
        author: savedLibraryBook.book.author,
        isbn: savedLibraryBook.book.isbn,
        genre: savedLibraryBook.book.genre,
        description: savedLibraryBook.book.description,
        coverUrl: getPreferredGoogleBooksCoverUrl(
          savedLibraryBook.book.cover_url,
        ),
      };

      setTrackedBooks((currentBooks) => [
        savedTrackedBook,
        ...currentBooks.filter(
          (book) => getTrackedBookKey(book) !== getTrackedBookKey(savedTrackedBook),
        ),
      ]);
      setLibraryBooks((currentBooks) => [
        savedLibraryEntry,
        ...currentBooks.filter(
          (book) => String(book.bookId) !== String(savedLibraryEntry.bookId),
        ),
      ]);
      setComposeDraft((draft) => ({
        ...draft,
        bookId: draft.bookId || String(savedLibraryEntry.bookId),
      }));
    } catch (error) {
      console.error("Failed to save current reading book:", error);
      setTrackedBooks((currentBooks) => [
        nextTrackedBook,
        ...currentBooks.filter((book) => book.isbn !== nextTrackedBook.isbn),
      ]);
    }

    setIsLogBookOpen(false);
  }

  async function updateTrackedProgress(bookToUpdate, field, value) {
    if (!requireLogin()) return;
    if (!bookToUpdate) return;

    const nextTotalPages =
      field === "totalPages"
        ? Math.max(0, Math.round(Number(value) || 0))
        : Math.max(0, Math.round(Number(bookToUpdate.totalPages) || 0));
    const nextPagesRead = Math.min(
      field === "pagesRead"
        ? Math.max(0, Math.round(Number(value) || 0))
        : Math.max(0, Math.round(Number(bookToUpdate.pagesRead) || 0)),
      nextTotalPages || Infinity,
    );
    const nextProgress = nextTotalPages
      ? Math.min(Math.round((nextPagesRead / nextTotalPages) * 100), 100)
      : 0;
    const shouldFinish = nextProgress >= 100;
    const bookKey = getTrackedBookKey(bookToUpdate);
    const updatedBook = {
      ...bookToUpdate,
      progress: nextProgress,
      pagesRead: nextPagesRead,
      totalPages: nextTotalPages || "",
      finished: shouldFinish,
    };

    setTrackedBooks((currentBooks) =>
      currentBooks.map((book) =>
        getTrackedBookKey(book) === bookKey ? updatedBook : book,
      ),
    );
    setLibraryBooks((currentBooks) =>
      currentBooks.map((book) =>
        String(book.shelfEntryId) === String(bookToUpdate.shelfEntryId)
          ? {
              ...book,
              progress: nextProgress,
              pagesRead: nextPagesRead,
              totalPages: nextTotalPages || "",
              shelf: shouldFinish ? "read" : "currently-reading",
            }
          : book,
      ),
    );

    if (bookToUpdate.shelfEntryId) {
      try {
        const savedBook = await updateLibraryBookProgress(
          bookToUpdate.shelfEntryId,
          {
            pagesRead: nextPagesRead,
            totalPages: nextTotalPages || null,
          },
        );

        setLibraryBooks((currentBooks) =>
          currentBooks.map((book) =>
            String(book.shelfEntryId) === String(savedBook.shelfEntryId)
              ? savedBook
              : book,
          ),
        );
      } catch (error) {
        console.error("Failed to save reading progress:", error);
      }
    }

    if (shouldFinish && !bookToUpdate.finished) {
      setFinishingBook(updatedBook);
      setFinishReviewError("");
      setIsFinishReviewOpen(true);
    }
  }

  async function finishTrackedBook(bookToFinish) {
    if (!requireLogin()) return;
    if (!bookToFinish) return;
    const bookKey = getTrackedBookKey(bookToFinish);
    const finishedBook = {
      ...bookToFinish,
      progress: 100,
      pagesRead: bookToFinish.totalPages || bookToFinish.pagesRead || 0,
      finished: true,
    };

    setFinishReviewError("");
    setTrackedBooks((currentBooks) =>
      currentBooks.map((book) =>
        getTrackedBookKey(book) === bookKey ? finishedBook : book,
      ),
    );
    setLibraryBooks((currentBooks) =>
      currentBooks.map((book) =>
        String(book.shelfEntryId) === String(bookToFinish.shelfEntryId)
          ? { ...book, shelf: "read", progress: 100 }
          : book,
      ),
    );

    if (bookToFinish.shelfEntryId) {
      try {
        const savedBook = await updateLibraryBookProgress(
          bookToFinish.shelfEntryId,
          {
            pagesRead:
              bookToFinish.totalPages || bookToFinish.pagesRead || 0,
            totalPages: bookToFinish.totalPages || null,
          },
        );

        setLibraryBooks((currentBooks) =>
          currentBooks.map((book) =>
            String(book.shelfEntryId) === String(savedBook.shelfEntryId)
              ? savedBook
              : book,
          ),
        );
      } catch (error) {
        console.error("Failed to mark book as finished:", error);
        setFinishReviewError(
          error.message || "Could not mark this book as finished.",
        );
      }
    }

    setFinishingBook(finishedBook);
    setIsFinishReviewOpen(true);
  }

  function closeFinishReview() {
    if (finishingBook) {
      setTrackedBooks((currentBooks) =>
        currentBooks.filter(
          (book) => getTrackedBookKey(book) !== getTrackedBookKey(finishingBook),
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
          coverUrl: finishingBook.coverUrl || "",
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
      addPostToFeedPage(createdFeedPost);
    }

    setFinishReview({ rating: 5, review: "", visibility: "private" });
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
      <RatingPicker
        value={finishReview.rating}
        onChange={(rating) =>
          setFinishReview((draft) => ({ ...draft, rating }))
        }
      />
    );
  }
  async function addModalBookToShelf() {
    if (!requireLogin()) return;
    if (!user?.id || !selectedBook) return;

    setAddingBook(true);

    try {
      const savedLibraryBook = await addBookToLibrary(
        user.id,
        selectedBook,
        modalShelf,
      );

      const nextLibraryBook = {
        shelfEntryId: savedLibraryBook.shelf.id,
        bookId: savedLibraryBook.book.id,
        shelf: savedLibraryBook.shelf.shelf,
        progress:
          savedLibraryBook.shelf.shelf === "read"
            ? 100
            : savedLibraryBook.shelf.progress ?? 0,
        rating: savedLibraryBook.shelf.rating,
        title: savedLibraryBook.book.title,
        author: savedLibraryBook.book.author,
        isbn: savedLibraryBook.book.isbn,
        genre: savedLibraryBook.book.genre,
        description: savedLibraryBook.book.description,
        coverUrl: getPreferredGoogleBooksCoverUrl(
          savedLibraryBook.book.cover_url,
        ),
      };

      setLibraryBooks((currentBooks) => [
        nextLibraryBook,
        ...currentBooks.filter(
          (book) => String(book.bookId) !== String(nextLibraryBook.bookId),
        ),
      ]);
      setComposeDraft((draft) => ({
        ...draft,
        bookId: String(nextLibraryBook.bookId),
      }));
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
      setPublishNoteError(
        "You must be logged in to publish.",
      );
      return;
    }

    const note = composeDraft.note.trim();
    const hasMarkedSpoilers = /\|\|[\s\S]+?\|\|/.test(note);

    if (!note) {
      setPublishNoteError(
        "Please write a note before publishing.",
      );
      return;
    }

    if (composeDraft.hasSpoilers && !hasMarkedSpoilers) {
      setPublishNoteError(
        "Highlight the spoiler text and click Mark Spoiler before publishing.",
      );
      return;
    }

    setPublishingNote(true);
    setPublishNoteError("");
    setModerationWarning(null);
    setModerationBlocked(null);

    if (!composeDraft.shareToFeed) {
      try {
        if (selectedComposerBook?.bookId) {
          await savePrivateBookNote({
            userId: user.id,
            bookId: selectedComposerBook.bookId,
            note,
          });
        }

        savePrivateReadingNote({
          userId: user.id,
          book: selectedComposerBook,
          note,
          hasSpoilers: composeDraft.hasSpoilers,
        });
      } catch (error) {
        console.error(
          "Failed to save private reading note:",
          error,
        );
        setPublishNoteError(
          error.message || "Could not save this private note.",
        );
        setPublishingNote(false);
        return;
      }

      setComposeDraft({
        bookId: selectedComposerBook
          ? String(selectedComposerBook.bookId)
          : "",
        note: "",
        hasSpoilers: false,
        shareToFeed: false,
      });

      setPublishingNote(false);
      setIsComposerOpen(false);
      return;
    }

    try {
      const createdPost = await createPost({
        userId: user.id,
        bookId:
          selectedComposerBook?.bookId || null,
        note,
        postType: "note",
        progress:
          selectedComposerBook?.progress ?? 0,
        rating: 0,
        allowModerationWarning: false,
      });

      addPostToFeedPage(createdPost);

      setComposeDraft({
        bookId: selectedComposerBook
          ? String(selectedComposerBook.bookId)
          : "",
        note: "",
        hasSpoilers: false,
        shareToFeed: false,
      });

      setIsComposerOpen(false);
    } catch (error) {
      console.error(
        "Failed to publish reading note:",
        error,
      );

      if (error.code === "MODERATION_WARNING") {
        setModerationWarning({
          type: "feed-post",
          message: error.message,
        });

        return;
      }

      if (error.code === "MODERATION_BLOCK") {
        setModerationBlocked({
          type: "feed-post",
          level: "block",
          message: error.message,
        });

        return;
      }

      if (error.code === "MODERATION_REPORT") {
        setModerationBlocked({
          type: "feed-post",
          level: "report",
          message: error.message,
        });

        return;
      }

      setPublishNoteError(
        error.message ||
          "Could not publish your note.",
      );
    } finally {
      setPublishingNote(false);
    }
  }

  async function confirmWarnedFeedPost() {
    if (
      moderationWarning?.type !== "feed-post" ||
      !user?.id
    ) {
      return;
    }

    const note = composeDraft.note.trim();
    const hasMarkedSpoilers = /\|\|[\s\S]+?\|\|/.test(note);

    if (!note) {
      setModerationWarning(null);
      return;
    }

    if (composeDraft.hasSpoilers && !hasMarkedSpoilers) {
      setModerationWarning(null);
      setPublishNoteError(
        "Highlight the spoiler text and click Mark Spoiler before publishing.",
      );
      return;
    }

    setModerationConfirming(true);
    setPublishNoteError("");

    try {
      const createdPost = await createPost({
        userId: user.id,
        bookId:
          selectedComposerBook?.bookId || null,
        note,
        postType: "note",
        progress:
          selectedComposerBook?.progress ?? 0,
        rating: 0,
        allowModerationWarning: true,
      });

      addPostToFeedPage(createdPost);

      setComposeDraft({
        bookId: selectedComposerBook
          ? String(selectedComposerBook.bookId)
          : "",
        note: "",
        hasSpoilers: false,
        shareToFeed: false,
      });

      setModerationWarning(null);
      setIsComposerOpen(false);
    } catch (error) {
      console.error(
        "Failed to publish warned reading note:",
        error,
      );

      if (error.code === "MODERATION_BLOCK") {
        setModerationWarning(null);
        setModerationBlocked({
          type: "feed-post",
          level: "block",
          message: error.message,
        });
        return;
      }

      if (error.code === "MODERATION_REPORT") {
        setModerationWarning(null);
        setModerationBlocked({
          type: "feed-post",
          level: "report",
          message: error.message,
        });
        return;
      }

      setPublishNoteError(
        error.message ||
          "Could not publish your note.",
      );
      console.error(
        "Failed to publish warned reading note:",
        error,
      );

      setPublishNoteError(
        error.message ||
          "Could not publish your note.",
      );
    } finally {
      setModerationConfirming(false);
    }
  }
  const combinedLeaderboard = [
    ...gradeLeaderboard.map((ranking) => ({
      label: t("home.grade", { grade: ranking.grade }),
      booksRead: ranking.booksRead,
      tieOrder: ranking.grade,
    })),
    {
      label: t("home.teachers"),
      booksRead: teacherBooksRead,
      tieOrder: 13,
    },
  ].sort(
    (a, b) =>
      b.booksRead - a.booksRead ||
      a.tieOrder - b.tieOrder,
  );
  const feedPageCount = Math.max(
    Math.ceil(feedTotalCount / FEED_PAGE_SIZE),
    1,
  );
  const feedRangeStart =
    feedTotalCount === 0
      ? 0
      : (feedPage - 1) * FEED_PAGE_SIZE + 1;
  const feedRangeEnd = Math.min(
    feedPage * FEED_PAGE_SIZE,
    feedTotalCount,
  );

  return (
    <div className="home-page">
      <HomepageSpotlightCarousel
        dailyQuote={dailyQuote}
        onFallbackAction={() => openComposer()}
      />

      <section
        className="grade-leaderboard-strip"
        aria-label={t("home.leaderboardAria")}
      >
        <div className="leaderboard-strip-heading">
          <p className="eyebrow">{t("home.leaderboard")}</p>
          <strong>{t("home.totalBooks")}</strong>
        </div>

        {leaderboardLoading ? (
          <p className="leaderboard-status">{t("home.loadingLeaderboard")}</p>
        ) : leaderboardError ? (
          <p className="profile-save-error" role="alert">
            {leaderboardError}
          </p>
        ) : (
          <ol
            className="leaderboard-podium"
            aria-label={t("home.rankedGroups")}
          >
            {combinedLeaderboard.map((ranking, index) => {
              const rank = index + 1;

              return (
                <li
                  className={`podium-step rank-${rank}`}
                  key={ranking.label}
                >
                  <span aria-label={t("home.rank", { rank })}>{rank}</span>
                  <strong>{ranking.label}</strong>
                  <small>
                    {t("home.booksRead", { count: ranking.booksRead })}
                  </small>
                </li>
              );
            })}
          </ol>
        )}
      </section>
	      <div className="home-grid">
	        <aside className="shelf-rail" aria-label={t("home.readingShelves")}>
	          {isLoggedIn ? (
	            <>
	              <section className="current-book-card" aria-label={t("home.trackerAria")}>
                <div className="section-heading compact">
              <div>
          <p className="eyebrow">{t("books.currentlyReading")}</p>
                <h2>{t("home.tracker")}</h2>
              </div>
            </div>
            {trackedBooks.length > 0 ? (
              <div className="tracked-books-list">
                {trackedBooks.map((book) => (
                  <article className="tracked-book-entry" key={getTrackedBookKey(book)}>
                    <div className="tracked-book-card home-tracked-book">
                      <BookCoverImage src={book.coverUrl} alt="" loading="lazy" />
                      <div>
                        <p>{book.author}</p>
                        <strong>{book.title}</strong>
                        <small>{t("home.complete", { progress: book.progress })}</small>
                      </div>
                    </div>
                    <div className="progress-editor compact">
                      <label>
                        <span>{t("home.pagesRead")}</span>
                        <input
                          type="number"
                          min="0"
                          max={book.totalPages || undefined}
                          value={book.pagesRead ?? 0}
                          onChange={(event) =>
                            updateTrackedProgress(
                              book,
                              "pagesRead",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>{t("home.totalPages")}</span>
                        <input
                          type="number"
                          min="1"
                          value={book.totalPages ?? ""}
                          placeholder={t("home.total")}
                          onChange={(event) =>
                            updateTrackedProgress(
                              book,
                              "totalPages",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <div>
                        <span>{book.progress}%</span>
                        <strong>{book.finished ? t("home.finished") : t("home.inProgress")}</strong>
                      </div>
                    </div>
                    <button
                      className="tracker-finish-inline"
                      type="button"
                      onClick={() => finishTrackedBook(book)}
                    >
                      {t("home.finish")}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="profile-empty">
                {t("home.noOpenBooks")}
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
	                {t("home.logBookShort")}
	              </button>
	            </div>
              </section>

	            </>
          ) : (
            <section className="signin-rail-card">
              <p className="eyebrow">{t("home.privateShelf")}</p>
              <h2>{t("home.signInTrack")}</h2>
              <p>{t("home.accountHelp")}</p>
              <button type="button" onClick={requireLogin}>
                {t("home.signInLog")}
              </button>
            </section>
          )}
        </aside>

        <section className="feed-column" aria-label={t("home.socialFeed")}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("home.currentReaders")}</p>
              <h2>{t("home.readingNotes")}</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => openComposer()}
            >
              {t("home.writeNoteShort")}
            </button>
          </div>

          <form
            className="feed-search-bar"
            role="search"
            onSubmit={searchFeedPosts}
          >
            <label>
              <span className="sr-only">{t("home.searchPosts")}</span>
              <input
                type="search"
                value={feedSearchDraft}
                onChange={(event) =>
                  setFeedSearchDraft(event.target.value)
                }
                placeholder={t("home.searchPostsPlaceholder")}
              />
            </label>
            <button type="submit">{t("common.search")}</button>
            {feedSearchQuery ? (
              <button
                className="feed-search-clear"
                type="button"
                onClick={clearFeedPostSearch}
              >
                {t("home.clear")}
              </button>
            ) : null}
          </form>

          {feedSearchQuery ? (
            <p className="feed-search-status">
              {t("home.showingAbout", { query: feedSearchQuery })}
            </p>
          ) : null}

          <div className="feed-list">
          {deletePostError ? (
            <p className="profile-save-error" role="alert">
              {deletePostError}
            </p>
          ) : null}
          {feedLoading ? (
            <p className="profile-empty">{t("home.loadingNotes")}</p>
          ) : feedError ? (
            <p className="profile-save-error" role="alert">
              {feedError}
            </p>
          ) : posts.length === 0 ? (
            <p className="profile-empty">
              {feedSearchQuery
                ? t("home.noBookPosts")
                : t("home.noPublishedNotes")}
            </p>
          ) : (
            feedEntries.map((entry) => {
              if (entry.type === "bundle-control") {
                return (
                  <div
                    className="feed-compressed-line"
                    key={entry.key}
                  >
                    <span className="feed-compressed-rule" aria-hidden="true" />
                    <button
                      className={entry.expanded ? "expanded" : ""}
                      type="button"
                      onClick={() =>
                        entry.expanded
                          ? collapseFeedBundle(entry.key)
                          : expandFeedBundle(entry.key)
                      }
                      aria-expanded={entry.expanded}
                    >
                      <span>
                        {entry.expanded
                          ? t("home.showFewer", { name: entry.userName })
                          : t("home.showMore", { count: entry.hiddenCount, name: entry.userName })}
                      </span>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <path
                          d={entry.expanded
                            ? "m5.5 12.5 4.5-4.5 4.5 4.5"
                            : "m5.5 7.5 4.5 4.5 4.5-4.5"}
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.2"
                        />
                      </svg>
                    </button>
                    <span className="feed-compressed-rule" aria-hidden="true" />
                  </div>
                );
              }

              const post = entry.post;

              return (
              <article className="feed-card sea" id={`feed-post-${post.id}`}
                tabIndex="-1" key={post.id}>
                <header className="feed-card-header">
                  <div className="avatar-stack">
                    <ProfileLink
                      userId={post.userId}
                      variant="avatar"
                      ariaLabel={t("home.viewProfile", { name: post.student })}
                    >
                      <UserAvatar
                        avatarUrl={post.avatarUrl}
                        name={post.student}
                        size="medium"
                      />
                    </ProfileLink>
                    <span className="activity-dot" aria-hidden="true" />
                  </div>

                  <div>
                    <p className="feed-title">
                      <Trans
                        i18nKey={post.activityKey}
                        values={{
                          username: post.student,
                          bookTitle: post.book,
                        }}
                        components={{
                          user: <ProfileLink userId={post.userId} />,
                          bold: <strong />,
                          book: <span />,
                        }}
                      />
                    </p>

                    <p className="feed-meta">
                      {formatFeedRelativeTime(
                        post.createdAt,
                        t,
                        i18n.resolvedLanguage,
                      )}
                    </p>
                  </div>
                </header>

                <div className="feed-note-bubble">
                  <p>{renderSpoilerText(post.note)}</p>
                </div>
                {post.hasBook && (
                <button
                  type="button"
                  className="book-strip"
                  onClick={() =>
                    openBookDetails({
                      bookId: post.bookId,
                      title: post.book,
                      author: post.author,
                      isbn: post.isbn,
                      source: post.source,
                      externalId: post.externalId,
                      googleBooksId: post.googleBooksId,
                      storedCoverUrl: post.storedCoverUrl,
                      coverUrl: post.coverUrl,
                    })
                  }
                >                  
                  <div className="book-cover" aria-hidden="true">
                    <RecoveringBookCoverImage
                      book={post}
                      src={post.coverUrl}
                      alt=""
                      loading="lazy"
                      fallback={<BookCoverPlaceholder decorative />}
                      onRepaired={(repairedCoverUrl) => {
                        setPosts((currentPosts) => currentPosts.map((currentPost) => (
                          currentPost.bookId === post.bookId
                            ? {
                                ...currentPost,
                                coverUrl: repairedCoverUrl,
                                storedCoverUrl: repairedCoverUrl,
                              }
                            : currentPost
                        )));
                      }}
                    />
                  </div>

                  <div className="book-strip-content">
                    <div className="book-details">
                      <p>{post.genre}</p>
                      <div className="feed-book-title-row">
                        <strong>{post.book}</strong>
                      </div>
                      <small>{post.author}</small>
                      <small>
                        {t("home.progressThrough", { progress: post.progress })}
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

                    <div className="rating-display">
                      {post.postType === "review" && (
                        <StarRating rating={post.rating} />
                      )}
                      <div
                        className="rating"
                        aria-label={
                          post.rating > 0
                            ? `${post.rating} out of 5 open books`
                            : t("home.noRating")
                        }
                      >
                        {post.rating > 0
                          ? `${post.rating} / 5`
                          : post.postType === "review"
                            ? t("home.finished")
                            : t("home.inProgress")}
                      </div>
                    </div>
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
                      post.liked ? t("home.unlikePost") : t("home.likePost")
                    }
                  >
                    <span aria-hidden="true">
                      <HeartIcon filled={post.liked} />
                    </span>
                    <small>{post.likes}</small>
                  </button>

                  <button
                    className="feed-action"
                    type="button"
                    aria-label={t("home.commentPost")}
                    onClick={() =>
                      focusCommentInput(post.id)
                    }
                  >
                    <span aria-hidden="true">
                      <CommentIcon />
                    </span>
                    <small>{post.comments.length}</small>
                  </button>

                  {post.userId === user?.id && (
                    <button
                      className="feed-action feed-delete-action"
                      type="button"
                      onClick={() => removePost(post.id)}
                      disabled={deletingPostId === post.id}
                    >
                      <span aria-hidden="true">×</span>
                      <small>
                        {deletingPostId === post.id ? t("home.deleting") : t("common.delete")}
                      </small>
                    </button>
                  )}
                </div>

                <div className="comment-section">
                  
                <div className="comment-list">
                  {(
                    expandedCommentPostIds.has(post.id)
                      ? post.comments
                      : post.comments.slice(-3)
                  ).map((comment) => (
                    <div
                      className={comment.isReply ? "comment-item comment-reply" : "comment-item"}
                      id={`${comment.isReply ? "reply" : "comment"}-${comment.id}`}
                      tabIndex={-1}
                      key={comment.id}
                    >
                      <ProfileLink
                        userId={comment.userId}
                        variant="avatar"
                        ariaLabel={t("home.viewProfile", { name: comment.commenterName })}
                      >
                        <UserAvatar
                          avatarUrl={comment.commenterAvatarUrl}
                          name={comment.commenterName}
                          size="small"
                        />
                      </ProfileLink>

                      <div className="comment-content">
                        <p>
                          <ProfileLink
                            userId={comment.userId}
                          >
                            <strong>
                              {comment.commenterName}
                            </strong>
                          </ProfileLink>{" "}

                            {comment.mentionedUserId && (
                              <span className="comment-posted-mention">
                                <ProfileLink
                                  userId={comment.mentionedUserId}
                                >
                                  @{comment.mentionedUsername ||
                                    comment.mentionedName}
                                </ProfileLink>{" "}
                              </span>
                            )}

                          {comment.text}
                        </p>

                        <div className="comment-item-actions">
                          <button
                            type="button"
                            className={
                              comment.liked
                                ? "comment-like-button active"
                                : "comment-like-button"
                            }
                            onClick={() =>
                              toggleCommentLike(post.id, comment.id)
                            }
                            aria-label={
                              comment.liked
                                ? t("home.unlikeComment")
                                : t("home.likeComment")
                            }
                          >
                            <span aria-hidden="true">
                              <HeartIcon filled={comment.liked} />
                            </span>
                            {comment.likes}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              beginCommentReply({
                                postId: post.id,
                                commentId: comment.id,
                                userId: comment.userId,
                                username:
                                  comment.commenterUsername,
                                commenterName:
                                  comment.commenterName,
                              })
                            }
                          >
                            <ReplyIcon />
                            {t("home.reply")}
                          </button>

                          {comment.userId === user?.id && (
                            <button
                              type="button"
                              className="comment-delete-button"
                              onClick={() =>
                                removeComment(
                                  post.id,
                                  comment.id,
                                )
                              }
                              disabled={
                                deletingCommentId ===
                                comment.id
                              }
                              aria-label={t("home.deleteComment")}
                            >
                              {deletingCommentId ===
                              comment.id
                                ? t("home.deleting")
                                : t("common.delete")}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {post.comments.length > 3 && (
                  <button
                    className="comment-fold-button"
                    type="button"
                    onClick={() =>
                      toggleComments(post.id)
                    }
                    aria-expanded={
                      expandedCommentPostIds.has(
                        post.id,
                      )
                    }
                  >
                    {expandedCommentPostIds.has(
                      post.id,
                    )
                      ? t("home.hideComments")
                      : t("home.viewAllComments", { count: post.comments.length })}
                  </button>
                )}
              </div>
                {commentModeratingPostId === post.id && (
                  <ModerationStatusBar
                    label={t("home.checkingComment")}
                  />
                )}
                {moderationWarning?.type ===
                  "feed-comment" &&
                  moderationWarning.postId === post.id && (
                    <ModerationWarningCard
                      message={moderationWarning.message}
                      contentLabel="comment"
                      confirming={moderationConfirming}
                      onEdit={() =>
                        setModerationWarning(null)
                      }
                      onConfirm={
                        confirmWarnedFeedComment
                      }
                    />
                  )}
                  {moderationBlocked?.type ===
                    "feed-comment" &&
                    moderationBlocked.postId === post.id && (
                      <ModerationBlockedCard
                        level={moderationBlocked.level}
                        message={moderationBlocked.message}
                        onEdit={() =>
                          setModerationBlocked(null)
                        }
                      />
                    )}
                <div className="comment-form">
                  <div className="comment-input-shell">
                    {commentReplyTargets[post.id] && (
                      <span
                        className="comment-mention-chip"
                        role="link"
                        tabIndex={0}
                        onClick={() => {
                          const target =
                            commentReplyTargets[post.id];

                          if (target?.userId) {
                            navigate(`/profile/${target.userId}`);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();

                            const target =
                              commentReplyTargets[post.id];

                            if (target?.userId) {
                              navigate(
                                `/profile/${target.userId}`,
                              );
                            }
                          }
                        }}
                      >
                        @{commentReplyTargets[post.id].username ||
                          commentReplyTargets[post.id].name}
                      </span>
                    )}

                    <input
                      type="text"
                      ref={(node) => {
                        if (node) {
                          commentInputRefs.current[
                            post.id
                          ] = node;
                        } else {
                          delete commentInputRefs.current[
                            post.id
                          ];
                        }
                      }}
                      value={post.draftComment}
                      disabled={
                        commentModeratingPostId ===
                          post.id ||
                        moderationConfirming
                      }
                      onChange={(event) => {
                        updateDraft(
                          post.id,
                          event.target.value,
                        );

                        if (
                          moderationWarning?.type ===
                            "feed-comment" &&
                          moderationWarning.postId ===
                            post.id
                        ) {
                          setModerationWarning(null);
                        }

                        if (
                          moderationBlocked?.type ===
                            "feed-comment" &&
                          moderationBlocked.postId ===
                            post.id
                        ) {
                          setModerationBlocked(null);
                        }
                      }}
                      onKeyDown={(event) => {
                        const replyTarget =
                          commentReplyTargets[
                            post.id
                          ];

                        /*
                        * When the input is empty, Backspace removes
                        * the whole mention chip in one press.
                        */
                        if (
                          event.key === "Backspace" &&
                          !post.draftComment &&
                          replyTarget
                        ) {
                          event.preventDefault();

                          setCommentReplyTargets(
                            (current) => {
                              const next = {
                                ...current,
                              };

                              delete next[post.id];

                              return next;
                            },
                          );

                          return;
                        }

                        if (
                          event.key === "Enter" &&
                          commentModeratingPostId ===
                            null &&
                          !moderationConfirming
                        ) {
                          event.preventDefault();
                          addComment(post.id);
                        }
                      }}
                      placeholder={t("home.addThought")}
                      aria-label={t("home.commentOn", { book: post.book })}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      addComment(post.id)
                    }
                    disabled={
                      commentModeratingPostId ===
                        post.id ||
                      moderationConfirming
                    }
                  >
                    {commentModeratingPostId ===
                    post.id
                      ? t("home.checking")
                      : t("home.send")}
                  </button>
                </div>
              </article>
              );
            })
          )}
        </div>
        {feedTotalCount > FEED_PAGE_SIZE ? (
          <nav
            className="feed-pagination"
            aria-label={t("home.pagesAria")}
          >
            <p>
              {t("home.showingPosts", { start: feedRangeStart, end: feedRangeEnd, count: feedTotalCount })}
            </p>
            <div>
              <button
                type="button"
                onClick={() =>
                  setFeedPage((page) => Math.max(page - 1, 1))
                }
                disabled={feedLoading || feedPage <= 1}
              >
                {t("common.previous")}
              </button>
              <span>
                {t("home.pageOf", { page: feedPage, count: feedPageCount })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFeedPage((page) =>
                    Math.min(page + 1, feedPageCount),
                  )
                }
                disabled={
                  feedLoading || feedPage >= feedPageCount
                }
              >
                {t("common.next")}
              </button>
            </div>
          </nav>
        ) : null}
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
              aria-label={t("home.closeComposer")}
            >
              x
            </button>
            <p className="eyebrow">{t("home.publishFeed")}</p>
            <h2 id="composer-title">{t("home.addNote")}</h2>
            <form onSubmit={publishNote}>
            <label>
              <span>{t("clubs.book")}</span>

              {libraryLoading ? (
                <p>{t("home.loadingBooks")}</p>
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
                  <option value="">{t("home.noSpecificBook")}</option>

                  {libraryBooks.map((book) => (
                    <option
                      value={String(book.bookId)}
                      key={book.shelfEntryId}
                    >
                      {book.title} - {book.author} / {getShelfLabel(book.shelf, t)}
                    </option>
                  ))}
                </select>
              )}
            </label>
              <label>
                <span>{t("home.noteOrQuote")}</span>
                <textarea
                  ref={composerTextareaRef}
                  value={composeDraft.note}
                  disabled={
                    publishingNote ||
                    moderationConfirming
                  }
                  onChange={(event) => {
                    setComposeDraft((draft) => ({
                      ...draft,
                      note: event.target.value,
                    }));

                    if (
                      moderationWarning?.type ===
                      "feed-post"
                    ) {
                      setModerationWarning(null);
                    }
                    if (
                      moderationBlocked?.type ===
                      "feed-post"
                    ) {
                      setModerationBlocked(null);
                    }
                  }}
                  placeholder={t("home.notePlaceholder")}
                  rows="6"
                />
              </label>
              <div className="spoiler-tools">
                <label className="spoiler-checkbox">
                  <input
                    type="checkbox"
                    checked={composeDraft.hasSpoilers}
                    disabled={
                      publishingNote ||
                      moderationConfirming
                    }
                    onChange={(event) =>
                      setComposeDraft((draft) => ({
                        ...draft,
                        hasSpoilers: event.target.checked,
                      }))
                    }
                  />
                  <span>{t("home.containsSpoilers")}</span>
                </label>
                <button
                  className="ghost-button spoiler-mark-button"
                  type="button"
                  disabled={
                    !composeDraft.hasSpoilers ||
                    publishingNote ||
                    moderationConfirming
                  }
                  onClick={markSelectedTextAsSpoiler}
                >
                  {t("home.markSelected")}
                </button>
              </div>
              {composeDraft.hasSpoilers ? (
                <p className="spoiler-help">
                  {t("home.spoilerHelp")}
                </p>
              ) : null}
              <label className="spoiler-checkbox public-feed-checkbox">
                <input
                  type="checkbox"
                  checked={composeDraft.shareToFeed}
                  disabled={
                    publishingNote ||
                    moderationConfirming
                  }
                  onChange={(event) =>
                    setComposeDraft((draft) => ({
                      ...draft,
                      shareToFeed: event.target.checked,
                    }))
                  }
                />
                <span>{t("home.sharePublic")}</span>
              </label>
              {publishingNote &&
                moderationWarning?.type !== "feed-post" && (
                  <ModerationStatusBar
                    label={t("home.checkingNote")}
                  />
                )}
              {moderationWarning?.type ===
                "feed-post" && (
                  <ModerationWarningCard
                    message={moderationWarning.message}
                    contentLabel="reading note"
                    confirming={moderationConfirming}
                    onEdit={() =>
                      setModerationWarning(null)
                    }
                    onConfirm={
                      confirmWarnedFeedPost
                    }
                  />
                )}
                {moderationBlocked?.type ===
                  "feed-post" && (
                    <ModerationBlockedCard
                      level={moderationBlocked.level}
                      message={moderationBlocked.message}
                      onEdit={() =>
                        setModerationBlocked(null)
                      }
                    />
                  )}
                <div className="modal-preview">
                  <div className="tracked-cover" aria-hidden="true">
                    {selectedComposerBook ? (
                      <BookCoverImage
                        src={getBookCoverSource(selectedComposerBook)}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span>{t("home.generalNote")}</span>
                    )}
                  </div>

                  <div>
                    <strong>
                      {selectedComposerBook?.title || t("home.noBookLinked")}
                    </strong>
                    <small>
                      {selectedComposerBook
                        ? `${selectedComposerBook.author} / ${getShelfLabel(selectedComposerBook.shelf, t)}`
                        : t("home.unattachedHelp")}
                    </small>
                  </div>
                </div>
              {publishNoteError ? (
                <p className="profile-save-error" role="alert">
                  {publishNoteError}
                </p>
              ) : null}
              <button
                className="primary-button full"
                type="submit"
                disabled={
                  publishingNote ||
                  moderationConfirming
                }
              >
                {publishingNote
                  ? t("home.checking")
                  : composeDraft.shareToFeed
                    ? t("home.shareNote")
                    : t("home.savePrivately")}
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
              aria-label={t("home.closeLogger")}
            >
              x
            </button>
            <p className="eyebrow">{t("books.currentlyReading")}</p>
            <h2>{t("home.logBook")}</h2>
            <form onSubmit={logCurrentBook}>
              <label>
                <span>{t("clubs.book")}</span>
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
                {t("home.startTracking")}
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
              disabled={finishReviewSaving}
              onClick={closeFinishReview}
              aria-label={t("books.closeReview")}
            >
              x
            </button>
            <p className="eyebrow">{t("books.finishedShelf")}</p>
            <h2>{t("home.finishBook")}</h2>
            <form onSubmit={submitFinishReview}>
              <label>
                <span>{t("home.rating")}</span>
                {renderRatingPicker()}
              </label>
              <label>
                <span>{t("home.review")}</span>
                <textarea
                  rows="5"
                  value={finishReview.review}
                  onChange={(event) =>
                    setFinishReview((draft) => ({ ...draft, review: event.target.value }))
                  }
                  placeholder={t("home.finishReviewPlaceholder")}
                />
              </label>

              <label className="spoiler-checkbox public-feed-checkbox">
                <input
                  type="checkbox"
                  checked={finishReview.visibility === "public"}
                  disabled={finishReviewSaving}
                  onChange={(event) =>
                    setFinishReview((draft) => ({
                      ...draft,
                      visibility: event.target.checked ? "public" : "private",
                    }))
                  }
                />
                <span>{t("home.sharePublic")}</span>
              </label>

              <div className="modal-preview">
                <div className="tracked-cover" aria-hidden="true">
                  {finishingBook ? (
                    <BookCoverImage
                      src={getBookCoverSource(finishingBook)}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span>{t("home.finishedBook")}</span>
                  )}
                </div>

                <div>
                  <strong>{finishingBook?.title || t("home.finishedBook")}</strong>
                  <small>
                    {finishingBook
                      ? `${finishingBook.author} / ${t("home.movingFinished")}`
                      : t("home.finalThoughts")}
                  </small>
                </div>
              </div>

              {finishReviewError ? (
                <p className="profile-save-error" role="alert">{finishReviewError}</p>
              ) : null}
              <button className="primary-button full" type="submit" disabled={finishReviewSaving}>
                {finishReviewSaving
                  ? t("profile.saving")
                  : finishReview.visibility === "public"
                    ? t("home.shareFinished")
                    : t("home.savePrivately")}
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
              <span>{t("search.addTo")}</span>

              <select
                value={modalShelf}
                onChange={(e) => setModalShelf(e.target.value)}
                disabled={addingBook || bookAdded}
              >
                <option value="to-be-read">{t("search.toBeRead")}</option>
                <option value="currently-reading">{t("books.currentlyReading")}</option>
                <option value="read">{t("search.read")}</option>
              </select>
            </label>

            <button
              className="primary-button full"
              type="button"
              onClick={addModalBookToShelf}
              disabled={addingBook || bookAdded}
            >
              {addingBook
                ? t("books.adding")
                : bookAdded
                  ? t("books.addedToShelf")
                  : t("books.addToMyShelf")}
            </button>
          </>
        }
      />
    </div>
  );
}

export default Home;
