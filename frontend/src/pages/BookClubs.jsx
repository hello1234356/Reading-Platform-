import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { requireSupabase } from "../lib/supabase";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRequireLogin } from "../hooks/useRequireLogin";
import BookCoverImage from "../components/BookCoverImage";
import { searchBooksByQueryLanguage } from "../lib/bookSearch";
import {
  applyBookModerationUpdate,
  moderateBookSearchResults,
} from "../lib/bookModerationApi.js";
import { getBookSourceLabel } from "../lib/bookSource.js";
import {
  archiveInactiveBookClubs,
  createBookClub,
  createClubPost,
  deleteBookClub,
  getBookClubs,
  getClubPosts,
  getClubSchedule,
  joinBookClub,
  leaveBookClub,
  recordClubActivity,
  replaceClubSchedule
} from "../lib/bookClubApi";
import UserAvatar from "../components/UserAvatar";
import BookModerationStatus from "../components/BookModerationStatus";
import ProfileLink from "../components/ProfileLink";
import ModerationWarningCard from "../components/ModerationWarningCard";
import ModerationStatusBar from "../components/ModerationStatusBar";
import ModerationBlockedCard from "../components/ModerationBlockedCard";


function getDefaultSchedule(duration = "4 weeks") {
  return [
    { week: "Week 1", milestone: "Begin", pages: "Opening chapters", note: "Introduce yourself and post one expectation." },
    { week: "Week 2", milestone: "Gather", pages: "First third", note: "Bring one quote that changed the mood." },
    { week: "Week 3", milestone: "Deepen", pages: "Middle section", note: "Discuss characters, conflict, and pace." },
    { week: "Week 4", milestone: "Close", pages: "Final pages", note: `Finish, reflect, and close the ${duration} circle.` },
  ];
}

function getClubActivityLabel(lastActivityAt, t) {
  if (!lastActivityAt) {
    return t("clubs.activityNone");
  }

  const activityDate = new Date(lastActivityAt);
  const daysSinceActivity = Math.floor(
    (Date.now() - activityDate.getTime()) / 86400000,
  );

  if (Number.isNaN(daysSinceActivity) || daysSinceActivity < 0) {
    return t("clubs.activityRecent");
  }

  if (daysSinceActivity === 0) {
    return t("clubs.activityToday");
  }

  if (daysSinceActivity === 1) {
    return t("clubs.activityYesterday");
  }

  return t("clubs.activityDays", { count: daysSinceActivity });
}

function shouldRecordClubRoomVisit({ clubId, userId }) {
  if (!clubId || !userId) {
    return false;
  }

  const key = `litshelf-club-room-visit-${clubId}-${userId}`;
  const now = Date.now();
  const fifteenMinutes = 15 * 60 * 1000;
  const lastRecordedAt = Number(sessionStorage.getItem(key) || 0);

  if (now - lastRecordedAt < fifteenMinutes) {
    return false;
  }

  sessionStorage.setItem(key, String(now));
  return true;
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

function hasProviderIdentity(book) {
  return Boolean(
    (book?.source === "google_books" && book.googleBooksId) ||
      (
        book?.source === "open_library" &&
        (book.openLibraryKey || book.editionKey)
      ),
  );
}

function canPersistBook(book) {
  return Boolean(getInternalBookId(book) || book?.isbn || hasProviderIdentity(book));
}

function getBookSelectionKey(book) {
  return (
    getInternalBookId(book) ||
    book?.isbn ||
    book?.googleBooksId ||
    book?.openLibraryKey ||
    book?.editionKey ||
    book?.title
  );
}

const BOOK_CLUB_QUERY_CACHE_TTL_MS = 15 * 60 * 1000;
const BOOK_CLUB_QUERY_FAILURE_TTL_MS = 30 * 1000;
const bookClubQueryCache = new Map();

function fetchGoogleBooks(searchTerm) {
  const cacheKey = String(searchTerm || "").trim().toLocaleLowerCase();
  const cached = bookClubQueryCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  if (cached) bookClubQueryCache.delete(cacheKey);

  const request = searchBooksByQueryLanguage(searchTerm).then(
    (result) => ({ ...result, results: result.results.filter(canPersistBook) }),
  );
  const cacheEntry = {
    promise: request,
    expiresAt: Date.now() + BOOK_CLUB_QUERY_CACHE_TTL_MS,
  };
  bookClubQueryCache.set(cacheKey, cacheEntry);
  void request.then(
    () => {},
    () => {
      cacheEntry.expiresAt = Date.now() + BOOK_CLUB_QUERY_FAILURE_TTL_MS;
    },
  );

  return request;
}

function getTypingLabel(names, t) {
  if (!Array.isArray(names) || names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return t("clubs.typingOne", { first: names[0] });
  }

  if (names.length === 2) {
    return t("clubs.typingTwo", { first: names[0], second: names[1] });
  }

  if (names.length === 3) {
    return t("clubs.typingThree", { first: names[0], second: names[1], third: names[2] });
  }

  return t("clubs.typingMany");
}

function BookClubs() {
  const { t, i18n } = useTranslation();
  const { requireLogin, user } = useRequireLogin();
  const navigate = useNavigate();
  const { clubId } = useParams();
 const [clubs, setClubs] = useState([]);
  const [clubPosts, setClubPosts] = useState({});
  const [clubSchedules, setClubSchedules] = useState({});
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [actionLoading, setActionLoading] = useState(false);  
  const [detailClubId, setDetailClubId] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [clubSearchQuery, setClubSearchQuery] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [typingUsers, setTypingUsers] =
    useState({});

  const [clubRealtimeStatus, setClubRealtimeStatus] =
    useState("connecting");

  const clubRealtimeChannelRef =
    useRef(null);

  const typingStopTimerRef =
    useRef(null);

  const typingExpiryTimersRef =
    useRef(new Map());

  const typingSentRef =
    useRef(false);
  const bookSearchRequestRef = useRef(0);
  const [
    clubModerationWarning,
    setClubModerationWarning,
  ] = useState(null);

  const [
    clubModerationConfirming,
    setClubModerationConfirming,
  ] = useState(false);
  const [
    clubMessageChecking,
    setClubMessageChecking,
  ] = useState(false);
  const [
    clubModerationBlocked,
    setClubModerationBlocked,
  ] = useState(null);
  const [newClub, setNewClub] = useState({
    clubName: "",
    bookTitle: "",
    membersWanted: "10",
    duration: "4 weeks",
    tagsText: "",
    schedule: [
      {
        theme: "",
        chapters: "",
        description: "",
      },
    ],
    description: "",
  });
  const [bookSearchResults, setBookSearchResults] = useState([]);
  const [bookSearchStatus, setBookSearchStatus] = useState("idle");
  const [bookSearchMessage, setBookSearchMessage] = useState("");
  const [selectedClubBook, setSelectedClubBook] = useState(null);
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] =
    useState(false);

  const [scheduleDraft, setScheduleDraft] = useState([
    {
      title: "",
      chapters: "",
      description: "",
    },
  ]);
  const detailClub = clubs.find(
    (club) => String(club.id) === String(detailClubId),
  );

  const routeClub = clubs.find(
    (club) => String(club.id) === String(clubId),
  );

  const lockedClub =
    routeClub && !routeClub.isJoined ? routeClub : null;

  const activeClub =
    routeClub && routeClub.isJoined
      ? {
          ...routeClub,
          schedule:
            clubSchedules[routeClub.id] ||
            getDefaultSchedule(routeClub.duration),
        }
      : null;
  const currentClubMember =
    activeClub?.members?.find(
      (member) =>
        String(member.userId) ===
        String(user?.id),
    );

  const currentClubDisplayName =
    currentClubMember?.name ||
    "Someone";

  const typingNames = useMemo(
    () =>
      Object.values(typingUsers)
        .map((typingUser) =>
          typingUser?.name?.trim(),
        )
        .filter(Boolean),
    [typingUsers],
  );

 const isClubCreator = (club) =>
  Boolean(
    user?.id &&
      club &&
      String(club.creatorId) === String(user.id),
  );

  const normalizedClubSearch =
  clubSearchQuery.trim().toLowerCase();

const filteredClubs = clubs.filter((club) => {
  if (!normalizedClubSearch) {
    return true;
  }

  return [
    club.title,
    club.bookTitle,
    club.author,
    club.creatorName,
    club.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedClubSearch);
});
  const previewBook =
    selectedClubBook ||
    bookSearchResults[0] || {
      title: newClub.bookTitle.trim() || "Search for a book",
      author: "Author will sync from the ISBN database",
      isbn: "Pending ISBN",
    };

  useEffect(() => {
    let cancelled = false;

    async function loadClubs() {
      setClubsLoading(true);
      setClubsError("");

      try {
        try {
          await archiveInactiveBookClubs(7);
        } catch (archiveError) {
          console.error("Failed to archive inactive clubs:", archiveError);
        }

        const nextClubs = await getBookClubs(user?.id || null);

        if (!cancelled) {
          setClubs(nextClubs);
        }
      } catch (error) {
        console.error("Failed to load book clubs:", error);

        if (!cancelled) {
          setClubsError(
            error.message || "Could not load book clubs.",
          );
        }
      } finally {
        if (!cancelled) {
          setClubsLoading(false);
        }
      }
    }

    loadClubs();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!routeClub?.isJoined || !user?.id) {
      return;
    }

    if (!shouldRecordClubRoomVisit({ clubId: routeClub.id, userId: user.id })) {
      return;
    }

    recordClubActivity({
      clubId: routeClub.id,
      userId: user.id,
      eventType: "visited_room",
    }).catch((error) => {
      console.error("Failed to record club room visit:", error);
    });
  }, [routeClub?.id, routeClub?.isJoined, user?.id]);

  useEffect(() => {
    const requestId = ++bookSearchRequestRef.current;
    if (!isCreateOpen) return undefined;

    const searchTerm = newClub.bookTitle.trim();

    if (searchTerm.length < 2) {
      return undefined;
    }

    if (selectedClubBook && searchTerm === selectedClubBook.title) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      setBookSearchStatus("loading");
      setBookSearchMessage("");

      try {
        const simplifiedSearchTerm = simplifySearchTerm(searchTerm);
        let searchResult = await fetchGoogleBooks(searchTerm);
        let { results } = searchResult;

        if (!results.length && simplifiedSearchTerm !== searchTerm) {
          searchResult = await fetchGoogleBooks(simplifiedSearchTerm);
          ({ results } = searchResult);
        }

        if (requestId !== bookSearchRequestRef.current) return;

        setBookSearchResults(results);
        setBookSearchStatus(results.length ? "success" : "error");
        setBookSearchMessage(
          results.length ? "" : "No ISBN-backed results found. Check the spelling or try the author name.",
        );
        void searchResult.startModeration((key, moderationStatus, details = {}) => {
          if (requestId !== bookSearchRequestRef.current) return;
          setBookSearchResults((current) => current.map((book) =>
            applyBookModerationUpdate(book, key, moderationStatus, details)));
        });
      } catch (error) {
        if (requestId !== bookSearchRequestRef.current) return;

        console.error("Failed to search Google Books:", error);
        setBookSearchStatus("error");
        setBookSearchMessage(
          error.message || "Book search is unavailable right now. Please try again.",
        );
      }
    }, 750);

    return () => window.clearTimeout(timeout);
  }, [isCreateOpen, newClub.bookTitle, selectedClubBook]);

  async function retryBookModeration(book) {
    const requestId = bookSearchRequestRef.current;
    const key = book.moderationKey;
    setBookSearchResults((current) => current.map((item) => item.moderationKey === key
      ? { ...item, moderationStatus: "checking", moderationFailureCode: "" }
      : item));
    await moderateBookSearchResults([book], (updateKey, moderationStatus, details = {}) => {
      if (requestId !== bookSearchRequestRef.current) return;
      setBookSearchResults((current) => current.map((item) =>
        applyBookModerationUpdate(item, updateKey, moderationStatus, details)));
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadClubRoom() {
      if (!routeClub?.isJoined) {
        return;
      }

      try {
        const [schedule, posts] = await Promise.all([
          getClubSchedule(routeClub.id),
          getClubPosts(routeClub.id),
        ]);

        if (cancelled) {
          return;
        }

        setClubSchedules((current) => ({
          ...current,
          [routeClub.id]: schedule,
        }));

        setClubPosts((current) => ({
          ...current,
          [routeClub.id]: posts,
        }));
      } catch (error) {
        console.error("Failed to load club room:", error);

        if (!cancelled) {
          setActionError(
            error.message || "Could not load this club room.",
          );
        }
      }
    }

    loadClubRoom();

    return () => {
      cancelled = true;
    };
  }, [routeClub?.id, routeClub?.isJoined]);

  useEffect(() => {
    if (
      !activeClub?.id ||
      !user?.id
    ) {
      return undefined;
    }

    const supabase = requireSupabase();
    const activeClubId = activeClub.id;

    let cancelled = false;
    let refreshInProgress = false;
    let refreshQueued = false;

    async function refreshClubMessages() {
      if (refreshInProgress) {
        refreshQueued = true;
        return;
      }

      refreshInProgress = true;

      try {
        const refreshedPosts =
          await getClubPosts(activeClubId);

        if (cancelled) {
          return;
        }

        setClubPosts((current) => ({
          ...current,
          [activeClubId]: refreshedPosts,
        }));
      } catch (error) {
        console.error(
          "Failed to refresh realtime club messages:",
          error,
        );
      } finally {
        refreshInProgress = false;

        if (
          refreshQueued &&
          !cancelled
        ) {
          refreshQueued = false;
          refreshClubMessages();
        }
      }
    }

    function removeTypingUser(
      typingUserId,
    ) {
      setTypingUsers((current) => {
        if (
          !Object.prototype.hasOwnProperty.call(
            current,
            typingUserId,
          )
        ) {
          return current;
        }

        const next = {
          ...current,
        };

        delete next[typingUserId];

        return next;
      });
    }

    function handleTypingBroadcast(
      event,
    ) {
      const typingPayload =
        event?.payload || {};

      const typingUserId =
        String(
          typingPayload.userId || "",
        );

      if (
        !typingUserId ||
        typingUserId ===
          String(user.id)
      ) {
        return;
      }

      const existingTimer =
        typingExpiryTimersRef.current.get(
          typingUserId,
        );

      if (existingTimer) {
        window.clearTimeout(
          existingTimer,
        );
      }

      if (!typingPayload.isTyping) {
        typingExpiryTimersRef.current.delete(
          typingUserId,
        );

        removeTypingUser(
          typingUserId,
        );

        return;
      }

      setTypingUsers((current) => ({
        ...current,
        [typingUserId]: {
          userId: typingUserId,
          name:
            String(
              typingPayload.name ||
                "Someone",
            ),
        },
      }));

      /*
      * Safety expiration:
      * if another client closes unexpectedly without broadcasting
      * "stopped typing", remove the indicator automatically.
      */
      const expiryTimer =
        window.setTimeout(() => {
          typingExpiryTimersRef.current.delete(
            typingUserId,
          );

          removeTypingUser(
            typingUserId,
          );
        }, 3000);

      typingExpiryTimersRef.current.set(
        typingUserId,
        expiryTimer,
      );
    }

    const channel = supabase.channel(
      `club-room-${activeClubId}`,
      {
        config: {
          broadcast: {
            self: false,
            ack: false,
          },
        },
      },
    );

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_posts",
          filter:
            `club_id=eq.${activeClubId}`,
        },
        () => {
          refreshClubMessages();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "club_posts",
        },
        (payload) => {
          const deletedClubId =
            payload?.old?.club_id;

          /*
          * Filtered DELETE subscriptions are limited, so verify
          * the club manually when club_id is available.
          */
          if (
            !deletedClubId ||
            String(deletedClubId) ===
              String(activeClubId)
          ) {
            refreshClubMessages();
          }
        },
      )
      .on(
        "broadcast",
        {
          event: "typing",
        },
        handleTypingBroadcast,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setClubRealtimeStatus(
            "connected",
          );
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setClubRealtimeStatus(
            "error",
          );
          return;
        }

        if (status === "CLOSED") {
          setClubRealtimeStatus(
            "disconnected",
          );
        }
      });

    clubRealtimeChannelRef.current =
      channel;
    const typingExpiryTimers =
      typingExpiryTimersRef.current;

    return () => {
      cancelled = true;

      if (
        typingStopTimerRef.current
      ) {
        window.clearTimeout(
          typingStopTimerRef.current,
        );

        typingStopTimerRef.current =
          null;
      }

      typingExpiryTimers.forEach(
        (timer) => {
          window.clearTimeout(timer);
        },
      );

      typingExpiryTimers.clear();
      typingSentRef.current = false;
      setTypingUsers({});
      setClubRealtimeStatus("disconnected");

      if (
        clubRealtimeChannelRef.current ===
        channel
      ) {
        clubRealtimeChannelRef.current =
          null;
      }

      supabase.removeChannel(channel);
    };
  }, [
    activeClub?.id,
    user?.id,
  ]);
  async function joinClub(selectedClubId) {
    if (!requireLogin() || !user?.id) {
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      await joinBookClub({
        clubId: selectedClubId,
        userId: user.id,
      });

      const refreshedClubs = await getBookClubs(user.id);
      setClubs(refreshedClubs);
      setDetailClubId(null);
    } catch (error) {
      console.error("Failed to join club:", error);
      setActionError(error.message || "Could not join the club.");
    } finally {
      setActionLoading(false);
    }
  }

  async function quitClub(selectedClubId) {
    if (!requireLogin() || !user?.id) {
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      await leaveBookClub({
        clubId: selectedClubId,
        userId: user.id,
      });

      const refreshedClubs = await getBookClubs(user.id);
      setClubs(refreshedClubs);
      setDetailClubId(null);

      if (String(selectedClubId) === String(clubId)) {
        navigate("/clubs");
      }
    } catch (error) {
      console.error("Failed to leave club:", error);
      setActionError(error.message || "Could not leave the club.");
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteClub(deletedClubId) {
    if (!requireLogin() || !user?.id) {
      return;
    }

    const clubToDelete = clubs.find(
      (club) => String(club.id) === String(deletedClubId),
    );

    if (!isClubCreator(clubToDelete)) {
      return;
    }

    if (
      !window.confirm(
        `Delete “${clubToDelete.title}”? This cannot be undone.`,
      )
    ) {
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      await deleteBookClub({
        clubId: deletedClubId,
        userId: user.id,
      });

      setClubs((current) =>
        current.filter(
          (club) =>
            String(club.id) !== String(deletedClubId),
        ),
      );

      setDetailClubId(null);

      if (String(deletedClubId) === String(clubId)) {
        navigate("/clubs");
      }
    } catch (error) {
      console.error("Failed to delete club:", error);
      setActionError(error.message || "Could not delete the club.");
    } finally {
      setActionLoading(false);
    }
  }

  function updateScheduleStep(index, field, value) {
    setNewClub((draft) => ({
      ...draft,
      schedule: (Array.isArray(draft.schedule) ? draft.schedule : []).map((step, stepIndex) =>
        stepIndex === index ? { ...step, [field]: value } : step,
      ),
    }));
  }

  function addScheduleStep() {
    setNewClub((draft) => ({
      ...draft,
      schedule: [
        ...(Array.isArray(draft.schedule)
          ? draft.schedule
          : []),
        {
          theme: "",
          chapters: "",
          description: "",
        },
      ],
    }));
  }

  function deleteScheduleStep(index) {
    setNewClub((draft) => ({
      ...draft,
      schedule:
        Array.isArray(draft.schedule) && draft.schedule.length > 1
          ? draft.schedule.filter((_, stepIndex) => stepIndex !== index)
          : draft.schedule,
    }));
  }
  function openScheduleEditor() {
    if (!activeClub || !isClubCreator(activeClub)) {
      return;
    }

    const currentSchedule =
      clubSchedules[activeClub.id] ||
      activeClub.schedule ||
      [];

    setScheduleDraft(
      currentSchedule.length > 0
        ? currentSchedule.map((step) => ({
            title:
              step.title ||
              step.milestone ||
              "",
            chapters:
              step.chapters ||
              step.pages ||
              "",
            description:
              step.description ||
              step.note ||
              "",
          }))
        : [
            {
              title: "",
              chapters: "",
              description: "",
            },
          ],
    );

    setActionError("");
    setIsScheduleEditorOpen(true);
  }

  function updateScheduleDraft(index, field, value) {
    setScheduleDraft((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index
          ? {
              ...step,
              [field]: value,
            }
          : step,
      ),
    );
  }

  function addScheduleDraftWeek() {
    setScheduleDraft((current) => [
      ...current,
      {
        title: "",
        chapters: "",
        description: "",
      },
    ]);
  }

  function deleteScheduleDraftWeek(index) {
    setScheduleDraft((current) =>
      current.length > 1
        ? current.filter(
            (_, stepIndex) => stepIndex !== index,
          )
        : current,
    );
  }

  async function saveScheduleChanges(event) {
    event.preventDefault();

    if (
      !activeClub ||
      !user?.id ||
      !isClubCreator(activeClub)
    ) {
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      const updatedSchedule =
        await replaceClubSchedule({
          clubId: activeClub.id,
          userId: user.id,
          stages: scheduleDraft.map((step) => ({
            title: step.title,
            chapters: step.chapters,
            description: step.description,
          })),
        });

      setClubSchedules((current) => ({
        ...current,
        [activeClub.id]: updatedSchedule,
      }));

      await recordClubActivity({
        clubId: activeClub.id,
        userId: user.id,
        eventType: "updated_schedule",
      });

      setIsScheduleEditorOpen(false);
    } catch (error) {
      console.error(
        "Failed to update club schedule:",
        error,
      );

      setActionError(
        error.message ||
          "Could not update the schedule.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  function broadcastTypingState(
    isTyping,
  ) {
    const channel =
      clubRealtimeChannelRef.current;

    if (
      !channel ||
      !activeClub?.id ||
      !user?.id
    ) {
      return;
    }

    channel
      .send({
        type: "broadcast",
        event: "typing",
        payload: {
          userId: user.id,
          name:
            currentClubDisplayName,
          isTyping,
          sentAt:
            new Date().toISOString(),
        },
      })
      .catch((error) => {
        console.error(
          "Failed to broadcast typing state:",
          error,
        );
      });
  }

  function stopClubTyping() {
    if (
      typingStopTimerRef.current
    ) {
      window.clearTimeout(
        typingStopTimerRef.current,
      );

      typingStopTimerRef.current =
        null;
    }

    if (typingSentRef.current) {
      broadcastTypingState(false);
      typingSentRef.current = false;
    }
  }

  function handleClubDraftChange(
    nextValue,
  ) {
    setPostDraft(nextValue);

    if (clubModerationWarning) {
      setClubModerationWarning(null);
    }

    if (clubModerationBlocked) {
      setClubModerationBlocked(null);
    }

    const hasText =
      Boolean(nextValue.trim());

    if (!hasText) {
      stopClubTyping();
      return;
    }

    /*
    * Send "typing started" only once instead of broadcasting on
    * every keystroke.
    */
    if (!typingSentRef.current) {
      broadcastTypingState(true);
      typingSentRef.current = true;
    }

    if (
      typingStopTimerRef.current
    ) {
      window.clearTimeout(
        typingStopTimerRef.current,
      );
    }

    /*
    * If no new keystroke occurs for 1.4 seconds, announce that
    * this user stopped typing.
    */
    typingStopTimerRef.current =
      window.setTimeout(() => {
        broadcastTypingState(false);
        typingSentRef.current = false;
        typingStopTimerRef.current =
          null;
      }, 1400);
  }

  async function publishClubPost(event) {
    event.preventDefault();

    if (!requireLogin() || !user?.id) {
      return;
    }

    if (clubMessageChecking) {
      return;
    }

    if (!activeClub) {
      return;
    }

    const message = postDraft.trim();

    if (!message) {
      return;
    }
    stopClubTyping();

    setActionLoading(true);
    setClubMessageChecking(true);
    setActionError("");
    setChatNotice("");
    setClubModerationWarning(null);
    setClubModerationBlocked(null);

    try {
      const createdPost = await createClubPost({
        clubId: activeClub.id,
        userId: user.id,
        message,
        allowModerationWarning: false,
      });

      setClubPosts((current) => ({
        ...current,
        [activeClub.id]: [
          ...(current[activeClub.id] || []),
          createdPost,
        ],
      }));

      setPostDraft("");
    } catch (error) {
      console.error(
        "Failed to publish club message:",
        error,
      );

      if (error.code === "MODERATION_WARNING") {
        setClubModerationWarning({
          message: error.message,
          text: message,
          clubId: activeClub.id,
        });

        return;
      }

      if (error.code === "MODERATION_BLOCK") {
        setClubModerationBlocked({
          level: "block",
          message: error.message,
        });

        return;
      }

      if (error.code === "MODERATION_REPORT") {
        setClubModerationBlocked({
          level: "report",
          message: error.message,
        });

        return;
      }
      setActionError(
        error.message ||
          "Could not publish your message.",
      );
    } finally {
      setActionLoading(false);
      setClubMessageChecking(false);
    }
  }

  
  async function confirmWarnedClubPost() {
    if (
      !clubModerationWarning ||
      !activeClub ||
      !user?.id
    ) {
      return;
    }

    if (
      String(
        clubModerationWarning.clubId,
      ) !== String(activeClub.id)
    ) {
      setClubModerationWarning(null);
      return;
    }
    stopClubTyping();
    setClubModerationConfirming(true);
    setActionError("");

    try {
      const createdPost = await createClubPost({
        clubId: activeClub.id,
        userId: user.id,
        message:
          clubModerationWarning.text,
        allowModerationWarning: true,
      });

      setClubPosts((current) => ({
        ...current,
        [activeClub.id]: [
          ...(current[activeClub.id] || []),
          createdPost,
        ],
      }));

      setPostDraft("");
      setClubModerationWarning(null);
    } catch (error) {
        console.error(
          "Failed to publish warned club message:",
          error,
        );

        if (error.code === "MODERATION_BLOCK") {
          setClubModerationWarning(null);
          setClubModerationBlocked({
            level: "block",
            message: error.message,
          });
          return;
        }

        if (error.code === "MODERATION_REPORT") {
          setClubModerationWarning(null);
          setClubModerationBlocked({
            level: "report",
            message: error.message,
          });
          return;
        }

        setActionError(
          error.message ||
            "Could not publish your message.",
        );
      } finally {
        setClubModerationConfirming(false);
      }
  }

  async function createClub(event) {
    event.preventDefault();

    if (!requireLogin() || !user?.id) {
      return;
    }

    if (!canPersistBook(selectedClubBook)) {
      setBookSearchStatus("error");
      setBookSearchMessage(
        "Choose a LitShelf book, ISBN-backed result, or provider-backed result before creating a club.",
      );
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      const tags = newClub.tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const createdClub = await createBookClub({
        userId: user.id,
        selectedBook: selectedClubBook,
        title:
          newClub.clubName.trim() ||
          `${selectedClubBook.title} Circle`,
        description:
          newClub.description.trim() ||
          "A reading circle for people who want to read together and discuss honestly.",
        duration: newClub.duration,
        membersWanted: Number(newClub.membersWanted),
        tags,
        coverUrl: selectedClubBook.coverUrl || null,
        schedule: newClub.schedule.map((step) => ({
          title: step.theme,
          chapters: step.chapters,
          description: step.description,
        })),
      });

      setClubs((current) => [createdClub, ...current]);
      setDetailClubId(null);
      setIsCreateOpen(false);

      setNewClub({
        clubName: "",
        bookTitle: "",
        membersWanted: "10",
        duration: "4 weeks",
        tagsText: "",
        schedule: [
          {
            theme: "",
            chapters: "",
            description: "",
          },
        ],
        description: "",
      });

      setSelectedClubBook(null);
      setBookSearchResults([]);
      setBookSearchStatus("idle");
      setBookSearchMessage("");
    } catch (error) {
      console.error("Failed to create club:", error);
      setActionError(error.message || "Could not create the club.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <section className="home-page clubs-page" aria-label={t("clubs.pageAria")}>
      {!activeClub && !lockedClub && (
        <>
          <header className="clubs-hero">
            <p className="eyebrow">{t("clubs.hero")}</p>
            <h1>{t("clubs.title")}</h1>
            <p className="school-motto">{t("clubs.motto")}</p>
          </header>

          <section className="club-toolbar" aria-label={t("clubs.filters")}>
            <div>
              <p className="eyebrow">{t("clubs.readingCircles")}</p>
              <h2>{t("clubs.joinFun")}</h2>
            </div>
            <label className="club-search-control">
              <span className="sr-only">{t("clubs.search")}</span>
              <input
                type="search"
                value={clubSearchQuery}
                onChange={(event) => setClubSearchQuery(event.target.value)}
                placeholder={t("clubs.searchPlaceholder")}
              />
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                if (!requireLogin()) return;
                setIsCreateOpen(true);
              }}
            >
              {t("clubs.createClubButton")}
            </button>
          </section>
        </>
      )}

      {lockedClub && (
        <section className="club-locked-room" aria-label={`${lockedClub.title} locked room`}>
          <Link className="club-room-back" to="/clubs">
            {t("clubs.backAll")}
          </Link>
          <div className="club-locked-card">
            <div className="club-detail-cover" aria-hidden="true">
              <BookCoverImage
                src={lockedClub.coverUrl}
                alt=""
                loading="lazy"
              />
            </div>
            <div>
              <p className="eyebrow">{t("clubs.joinRequired")}</p>
              <h2>{lockedClub.title}</h2>
              <p>
                {t("clubs.joinRequiredHelp")}
              </p>
              <button className="primary-button" type="button" onClick={() => joinClub(lockedClub.id)}>
                {t("clubs.joinClub")}
              </button>
            </div>
          </div>
        </section>
      )}

      {activeClub ? (
        <section className="club-room" aria-label={`${activeClub.title} room`}>
          <Link className="club-room-back" to="/clubs">
            {t("clubs.backAll")}
          </Link>
          <div className="club-room-heading">
            <div className="club-room-cover" aria-hidden="true">
              <BookCoverImage
                src={activeClub.coverUrl}
                alt=""
                loading="lazy"
              />
            </div>
            <div>
              <p className="eyebrow">{t("clubs.youJoined")}</p>
              <h2>{activeClub.title}</h2>
              <p className="club-room-meta">
                <strong>{activeClub.bookTitle}</strong>
                <span>by {activeClub.author}</span>

                <em>
                  {t("clubs.host")}:{" "}
                  <ProfileLink userId={activeClub.creatorId}>
                    {activeClub.creatorName}
                  </ProfileLink>
                </em>
              </p>
              <button className="club-danger-action" type="button" onClick={() => quitClub(activeClub.id)}>
                {t("clubs.quit")}
              </button>
              {isClubCreator(activeClub) && (
                <button
                  className="club-danger-action"
                  type="button"
                  onClick={() => deleteClub(activeClub.id)}
                >
                  {t("clubs.deleteClub")}
                </button>
              )}
            </div>
          </div>

          <div className="club-room-grid">
            <section
              className="reading-calendar"
              aria-label={t("clubs.readingSchedule")}
            >
              <div className="reading-calendar-heading">
                <p className="eyebrow">
                  {t("clubs.managerSchedule")}
                </p>

                {isClubCreator(activeClub) && (
                  <button
                    className="ghost-button schedule-edit-button"
                    type="button"
                    onClick={openScheduleEditor}
                  >
                    {t("clubs.editSchedule")}
                  </button>
                )}
              </div>
              <div>
                {activeClub.schedule.map((step, index) => (
                  <article key={step.id || `schedule-${index}`}>
                    <span>{step.position || index + 1}</span>

                    <div>
                      <strong>
                        {t("clubs.week", { week: step.position || index + 1 })}:{" "}
                        {step.title || step.milestone}
                      </strong>

                      <small>
                        {step.chapters || step.pages}
                      </small>

                      {(step.description || step.note) && (
                        <p>
                          {step.description || step.note}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="club-posts" aria-label={t("clubs.messages")}>
              <div className="club-chat-heading">
                <p className="eyebrow">{t("clubs.discussionRoom")}</p>
                <strong>#{activeClub.bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</strong>
              </div>
              <div className="club-post-list">
                {(clubPosts[activeClub.id] || []).length === 0 ? (
                  <p>
                    {t("clubs.noMessages")}
                  </p>
                ) : (
                  (clubPosts[activeClub.id] || []).map((post) => (
                    <article key={post.id}>
                      <ProfileLink
                        userId={post.userId}
                        variant="avatar"
                        ariaLabel={`View ${post.authorName}'s profile`}
                      >
                        <UserAvatar
                          avatarUrl={post.authorAvatarUrl}
                          name={post.authorName}
                          size="small"
                          className="message-avatar"
                        />
                      </ProfileLink>

                      <div>
                        <ProfileLink userId={post.userId}>
                          <strong>
                            {post.authorName}
                          </strong>
                        </ProfileLink>

                        {String(post.userId) ===
                          String(activeClub.creatorId) && (
                          <span className="club-host-label">
                            Host
                          </span>
                        )}

                        <small>
                          {new Date(post.createdAt).toLocaleString(i18n.resolvedLanguage)}
                        </small>

                        <p>{post.message}</p>       
                      </div>
                    </article>
                  ))
                )}
              </div>
              {chatNotice ? (
                <p className="club-chat-notice" role="status">
                  {chatNotice}
                </p>
              ) : null}
              {clubMessageChecking && (
                <ModerationStatusBar
                  label={t("clubs.checkingMessage")}
                />
              )}
              {clubModerationWarning && (
                <ModerationWarningCard
                  message={
                    clubModerationWarning.message
                  }
                  contentLabel="club message"
                  confirming={
                    clubModerationConfirming
                  }
                  onEdit={() =>
                    setClubModerationWarning(null)
                  }
                  onConfirm={
                    confirmWarnedClubPost
                  }
                />
              )}
              {clubModerationBlocked && (
                <ModerationBlockedCard
                  level={clubModerationBlocked.level}
                  message={clubModerationBlocked.message}
                  onEdit={() =>
                    setClubModerationBlocked(null)
                  }
                />
              )}
              {clubRealtimeStatus === "error" && (
                <p
                  className="club-realtime-error"
                  role="status"
                >
                  {t("clubs.disconnected")}
                </p>
              )}
              {typingNames.length > 0 && (
                <div
                  className="club-typing-indicator"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="club-typing-dots"
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>

                  <span>
                    {getTypingLabel(typingNames, t)}
                  </span>
                </div>
              )}
              <form className="club-message-form" onSubmit={publishClubPost}>
                <textarea
                  value={postDraft}
                  disabled={
                    clubMessageChecking ||
                    clubModerationConfirming
                  }
                 onChange={(event) => {
                    handleClubDraftChange(
                      event.target.value,
                    );
                  }}
                  placeholder={t("clubs.messageTo", { club: activeClub.title })}
                  rows="2"
                />
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    clubMessageChecking ||
                    clubModerationConfirming
                  }
                >
                  {clubMessageChecking
                    ? t("home.checking")
                    : t("home.send")}
                </button>
              </form>
            </section>

            <aside className="club-members-panel" aria-label={t("clubs.members")}>
              <p className="eyebrow">{t("clubs.readers")}</p>
              <strong>{activeClub.memberCount}/{activeClub.membersWanted}</strong>              
              <div>
                {(activeClub.members || []).map((member) => (
                  <ProfileLink
                    key={member.userId}
                    userId={member.userId}
                    variant="avatar"
                    ariaLabel={`View ${member.name}'s profile`}
                  >
                    <UserAvatar
                      avatarUrl={member.avatarUrl}
                      name={member.name}
                      size="small"
                      className="member-avatar"
                    />
                  </ProfileLink>
                ))}
              </div>

            </aside>
          </div>
        </section>
      ) : !lockedClub && (
  <>
    {clubsLoading && (
      <p className="club-empty-state">
        {t("clubs.loading")}
      </p>
    )}

    {clubsError && (
      <p className="club-empty-state">
        {clubsError}
      </p>
    )}

    {actionError && (
      <p className="club-empty-state">
        {actionError}
      </p>
    )}

    {!clubsLoading && !clubsError && (
      <section className="club-grid" aria-label={t("clubs.available")}>
{filteredClubs.map((club) => (
              <article className={`club-card ${club.tone}`} key={club.id}>
                <div className="club-cover" aria-hidden="true">
                  <BookCoverImage
                    src={club.coverUrl}
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="club-card-copy">
                  <div className="club-card-heading">
                    <h2>{club.bookTitle}</h2>
                    <p className="club-card-name">{club.title}</p>
                    <small className="club-card-founder">
                      {t("clubs.startedByLabel")}{" "}
                      <ProfileLink userId={club.creatorId}>
                        {club.creatorName}
                      </ProfileLink>
                    </small>
                  </div>

                  <p className="club-card-description">{club.description}</p>
                  <div className="club-card-meta">
                    <p className="club-activity-status">
                      {getClubActivityLabel(club.lastActivityAt, t)}
                    </p>
                    <strong>
                      {t("clubs.readerCount", { current: club.memberCount, wanted: club.membersWanted })}
                    </strong>
                  </div>
                  <div className="club-capacity" aria-hidden="true">
                    <span style={{ width: `${(club.memberCount / club.membersWanted) * 100}%` }} />
                  </div>
                  <div className="club-card-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setDetailClubId(club.id)}
                    >
                      {t("clubs.details")}
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => joinClub(club.id)}
                      disabled={club.isJoined || actionLoading}
                    >
                      {club.isJoined ? t("clubs.joined") : t("clubs.join")}
                    </button>
                    {club.isJoined && (
                      <Link className="primary-button" to={`/clubs/${club.id}`}>
                        {t("clubs.openRoom")}
                      </Link>
                    )}
                    {club.isJoined && (
                      <button
                        className="club-danger-action"
                        type="button"
                        onClick={() => quitClub(club.id)}
                      >
                        {t("clubs.quit")}
                      </button>
                    )}
                    {isClubCreator(club) && (
                      <button
                        className="club-danger-action"
                        type="button"
                        onClick={() => deleteClub(club.id)}
                      >
                        {t("clubs.deleteClub")}
                      </button>
                    )}
                  </div>
                </div>
              </article>
          ))}

        {filteredClubs.length === 0 && (
          <p className="club-empty-state">
            {clubs.length === 0
              ? t("clubs.empty")
              : t("clubs.noMatch")}
          </p>
        )}
      </section>
    )}
  </>
)}

      {detailClub && (
        <div
          className="club-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDetailClubId(null);
            }
          }}
        >
          <section
            className="club-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="club-detail-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setDetailClubId(null)}
              aria-label={t("clubs.closeDetails")}
            >
              x
            </button>
              <p className="eyebrow">{t("clubs.beforeJoin")}</p>
            <div className="club-detail-cover" aria-hidden="true">
              <BookCoverImage
                src={detailClub.coverUrl}
                alt=""
                loading="lazy"
              />
            </div>
            <h2 id="club-detail-title">{detailClub.title}</h2>
            <p>
              <strong>{detailClub.bookTitle}</strong> by {detailClub.author}
            </p>
            <dl>
              <div>
                <dt>{t("clubs.tags")}</dt>
                <dd>
                  {detailClub.tags.length > 0
                    ? detailClub.tags.join(", ")
                    : t("clubs.noTags")}
                </dd>
              </div>
              <div>
                <dt>{t("clubs.startedByLabel")}</dt>
                <dd>
                  <ProfileLink userId={detailClub.creatorId}>
                    {detailClub.creatorName}
                  </ProfileLink>
                </dd>
              </div>

              <div>
                <dt>{t("clubs.lookingFor")}</dt>
                <dd>{t("clubs.memberCount", { count: detailClub.membersWanted })}</dd>
              </div>
              <div>
                <dt>{t("clubs.length")}</dt>
                <dd>{detailClub.duration}</dd>
              </div>
              <div>
                <dt>ISBN</dt>
                <dd>{detailClub.isbn}</dd>
              </div>
            </dl>
            <button
              className="primary-button full"
              type="button"
              onClick={() => joinClub(detailClub.id)}
              disabled={detailClub.isJoined || actionLoading}
            >
              {detailClub.isJoined ? t("clubs.joinedProfile") : t("clubs.joinThis")}
            </button>
            {detailClub.isJoined && (
              <Link className="primary-button full" to={`/clubs/${detailClub.id}`}>
                {t("clubs.openClubRoom")}
              </Link>
            )}
            {detailClub.isJoined && (
              <button
                className="club-danger-action"
                type="button"
                onClick={() => quitClub(detailClub.id)}
              >
                {t("clubs.quit")}
              </button>
            )}
            {isClubCreator(detailClub) && (
              <button
                className="club-danger-action"
                type="button"
                onClick={() => deleteClub(detailClub.id)}
              >
                {t("clubs.deleteClub")}
              </button>
            )}
          </section>
        </div>
      )}
    {isScheduleEditorOpen && activeClub && (
      <div
        className="club-modal-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setIsScheduleEditorOpen(false);
          }
        }}
      >
        <section
          className="club-modal schedule-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-editor-title"
        >
          <button
            className="modal-close"
            type="button"
            onClick={() =>
              setIsScheduleEditorOpen(false)
            }
            aria-label={t("common.close")}
          >
            x
          </button>

          <p className="eyebrow">
            Club Management
          </p>

          <h2 id="schedule-editor-title">
            Edit Reading Schedule
          </h2>

          <p>
            Update the reading plan as your club
            progresses. Members will see the changes
            immediately.
          </p>

          <form onSubmit={saveScheduleChanges}>
            <div className="schedule-builder-list">
              {scheduleDraft.map((step, index) => (
                <div
                  className="schedule-builder-row"
                  key={`edit-schedule-${index}`}
                >
                  <span>Week {index + 1}</span>

                  <input
                    type="text"
                    value={step.title}
                    onChange={(event) =>
                      updateScheduleDraft(
                        index,
                        "title",
                        event.target.value,
                      )
                    }
                    placeholder={t("clubs.theme")}
                  />

                  <input
                    type="text"
                    value={step.chapters}
                    onChange={(event) =>
                      updateScheduleDraft(
                        index,
                        "chapters",
                        event.target.value,
                      )
                    }
                    placeholder={t("clubs.chapters")}
                  />

                  <textarea
                    value={step.description}
                    onChange={(event) =>
                      updateScheduleDraft(
                        index,
                        "description",
                        event.target.value,
                      )
                    }
                    placeholder={t("clubs.prompt")}
                    rows="3"
                  />

                  <button
                    className="schedule-remove-button"
                    type="button"
                    onClick={() =>
                      deleteScheduleDraftWeek(index)
                    }
                    disabled={
                      scheduleDraft.length <= 1
                    }
                  >
                    Delete Week
                  </button>
                </div>
              ))}
            </div>

            <button
              className="schedule-add-button"
              type="button"
              onClick={addScheduleDraftWeek}
            >
              Add Week
            </button>

            {actionError && (
              <p className="book-search-status error">
                {actionError}
              </p>
            )}

            <button
              className="primary-button full"
              type="submit"
              disabled={actionLoading}
            >
              {actionLoading
                ? "Saving..."
                : "Save Schedule"}
            </button>
          </form>
        </section>
      </div>
    )}
      {isCreateOpen && (
        <div
          className="club-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsCreateOpen(false);
            }
          }}
        >
          <section
            className="club-modal create-club-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-club-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setIsCreateOpen(false)}
              aria-label={t("clubs.closeCreate")}
            >
              x
            </button>
            <p className="eyebrow">{t("clubs.startCircle")}</p>
            <h2 id="create-club-title">{t("clubs.createBookClub")}</h2>
            <div className="create-club-layout">
              <form onSubmit={createClub}>
                <label>
                  <span>{t("clubs.bookClubName")}</span>
                  <input
                    type="text"
                    value={newClub.clubName}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, clubName: event.target.value }))
                    }
                    placeholder="Sunday Subway Readers"
                  />
                </label>
                <label className="book-search-field">
                  <span>{t("clubs.bookTitle")}</span>
                  <input
                    type="search"
                    value={newClub.bookTitle}
                    onChange={(event) => {
                      const nextBookTitle = event.target.value;

                      setNewClub((draft) => ({ ...draft, bookTitle: nextBookTitle }));
                      setSelectedClubBook(null);

                      if (nextBookTitle.trim().length < 2) {
                        setBookSearchResults([]);
                        setBookSearchStatus("idle");
                        setBookSearchMessage("");
                      }
                    }}
                    placeholder={t("clubs.searchBook")}
                  />
                </label>
                {bookSearchStatus === "loading" && (
                  <p className="book-search-status">{t("clubs.searchingDatabase")}</p>
                )}
                {bookSearchMessage ? (
                  <p className="book-search-status error">{bookSearchMessage}</p>
                ) : null}
                {bookSearchResults.length > 0 && (
                  <div className="book-search-suggestions" aria-label={t("clubs.suggestions")}>
                    {bookSearchResults.map((book) => (
                      <div
                        className="book-search-suggestion"
                        key={`${book.source || "book"}-${getBookSelectionKey(book)}`}
                      >
                        <button
                          type="button"
                          disabled={book.moderationStatus !== "approved"}
                          className={`book-search-suggestion-select ${
                            getBookSelectionKey(selectedClubBook) === getBookSelectionKey(book)
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            {
                              setSelectedClubBook(book);
                              setNewClub((draft) => ({ ...draft, bookTitle: book.title }));
                              setBookSearchResults([]);
                              setBookSearchStatus("idle");
                              setBookSearchMessage("");
                            }
                          }
                        >
                          <BookCoverImage
                            src={book.coverUrl}
                            alt=""
                            loading="lazy"
                          />
                          <strong>{book.title}</strong>
                          <small>
                            {book.author}
                            {book.firstPublished ? ` / ${book.firstPublished}` : ""}
                            {` / ${getBookSourceLabel(book)}`}
                            {" "}
                            {book.isbn ? `/ ISBN ${book.isbn}` : ""}
                          </small>
                        </button>
                        <BookModerationStatus book={book} onRetry={retryBookModeration} />
                      </div>
                    ))}
                  </div>
                )}
                <label>
                  <span>{t("clubs.tags")}</span>

                  <input
                    type="text"
                    value={newClub.tagsText}
                    onChange={(event) =>
                      setNewClub((draft) => ({
                        ...draft,
                        tagsText: event.target.value,
                      }))
                    }
                    placeholder="slow reading, fantasy, discussion-heavy"
                  />

                  <small>
                    Separate tags with commas. Tags are labels only and
                    do not filter clubs.
                  </small>
                </label>
                <label>
                  <span>{t("clubs.membersWanted")}</span>
                  <input
                    type="number"
                    min="2"
                    max="40"
                    value={newClub.membersWanted}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, membersWanted: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>{t("clubs.howLong")}</span>
                  <input
                    type="text"
                    value={newClub.duration}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, duration: event.target.value }))
                    }
                    placeholder="4 weeks"
                  />
                </label>
                <fieldset className="schedule-builder">
                  <legend>{t("clubs.readingSchedule")}</legend>
                  <div className="schedule-builder-list">
                    {(Array.isArray(newClub.schedule) ? newClub.schedule : []).map((step, index) => (
                      <div className="schedule-builder-row" key={`schedule-step-${index + 1}`}>
                        <span>{t("clubs.week", { week: index + 1 })}</span>
                        <input
                          type="text"
                          value={step.theme}
                          onChange={(event) =>
                            updateScheduleStep(index, "theme", event.target.value)
                          }
                          placeholder={t("clubs.theme")}
                        />
                        <input
                          type="text"
                          value={step.chapters}
                          onChange={(event) =>
                            updateScheduleStep(index, "chapters", event.target.value)
                          }
                          placeholder={t("clubs.chapters")}
                        />
                        <textarea
                          value={step.description}
                          onChange={(event) =>
                            updateScheduleStep(index, "description", event.target.value)
                          }
                          placeholder={t("clubs.prompt")}
                          rows="2"
                        />
                        <button
                          className="schedule-remove-button"
                          type="button"
                          onClick={() => deleteScheduleStep(index)}
                          disabled={
                            !Array.isArray(newClub.schedule) || newClub.schedule.length <= 1
                          }
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="schedule-add-button" type="button" onClick={addScheduleStep}>
                    {t("clubs.addWeek")}
                  </button>
                </fieldset>
                <label>
                  <span>{t("clubs.description")}</span>
                  <textarea
                    maxLength="350"
                    value={newClub.description}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, description: event.target.value }))
                    }
                    placeholder={t("clubs.description")}
                    rows="4"
                  />
                  <small className="character-count">{newClub.description.length}/350 characters</small>
                </label>
                <button
                  className="primary-button full"
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading ? t("clubs.creating") : t("clubs.createAction")}
                </button>
              </form>
              <aside className="create-club-preview" aria-label={t("clubs.selectedPreview")}>
                <div className="club-detail-cover">
                  <BookCoverImage
                    src={previewBook.coverUrl}
                    alt=""
                    loading="lazy"
                  />
                </div>
                <strong>{previewBook.title}</strong>
                <small>{previewBook.author}</small>
                <p>{previewBook.isbn}</p>
              </aside>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default BookClubs;
