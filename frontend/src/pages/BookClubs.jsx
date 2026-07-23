import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useRequireLogin } from "../hooks/useRequireLogin";
import { getOpenLibraryBookDetails } from "../lib/openLibrary";
import { getUserProfile } from "../lib/profileApi";
import { getUserDisplayHandle } from "../lib/socialFeed";
import {
  createBookClub,
  createClubPost,
  deleteBookClub,
  getBookClubs,
  getClubPosts,
  getClubSchedule,
  joinBookClub,
  leaveBookClub,
  replaceClubSchedule
} from "../lib/bookClubApi";

function getDefaultSchedule(duration = "4 weeks") {
  return [
    { week: "Week 1", milestone: "Begin", pages: "Opening chapters", note: "Introduce yourself and post one expectation." },
    { week: "Week 2", milestone: "Gather", pages: "First third", note: "Bring one quote that changed the mood." },
    { week: "Week 3", milestone: "Deepen", pages: "Middle section", note: "Discuss characters, conflict, and pace." },
    { week: "Week 4", milestone: "Close", pages: "Final pages", note: `Finish, reflect, and close the ${duration} circle.` },
  ];
}

function getCoverUrl(isbn, size = "L") {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false` : "";
}

function hideBrokenCover(event) {
  event.currentTarget.hidden = true;
}

function simplifySearchTerm(searchTerm) {
  return searchTerm
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOpenLibraryBooks(searchTerm) {
  const response = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(searchTerm)}&fields=key,title,author_name,isbn,cover_i,first_publish_year&limit=12`,
  );

  if (!response.ok) {
    throw new Error("Open Library request failed");
  }

  const data = await response.json();

  return (data.docs || [])
    .filter((result) => result.isbn?.length)
    .map((result) => ({
      openLibraryKey: result.key,
      title: result.title || "Untitled",
      author: result.author_name?.join(", ") || "Unknown author",
      isbn: result.isbn[0],
      firstPublished: result.first_publish_year || null,
      coverUrl: result.cover_i
        ? `https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg`
        : getCoverUrl(result.isbn[0], "M"),
    }));
}

function BookClubs() {
  const { requireLogin, user } = useRequireLogin();
  const navigate = useNavigate();
  const { clubId } = useParams();
 const [clubs, setClubs] = useState([]);
  const [clubPosts, setClubPosts] = useState({});
  const [clubSchedules, setClubSchedules] = useState({});
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);  
  const [detailClubId, setDetailClubId] = useState(null);
  const [detailBlurb, setDetailBlurb] = useState("");
  const [detailBlurbLoading, setDetailBlurbLoading] = useState(false);
  const [detailBlurbError, setDetailBlurbError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [clubSearchQuery, setClubSearchQuery] = useState("");
  const [postDraft, setPostDraft] = useState("");
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
  const [profile, setProfile] = useState(null);
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

  const currentReaderName = getUserDisplayHandle(user, profile);
  const displayReaderName = (name) =>
    name === "Anonymous Reader" || name === "You" ? currentReaderName : name;
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

    async function loadProfile() {
      if (!user?.id) {
        setProfile(null);
        return;
      }

      try {
        const nextProfile = await getUserProfile(user.id);
        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch (error) {
        console.error("Failed to load book club profile:", error);
        if (!cancelled) {
          setProfile(null);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  useEffect(() => {
    let cancelled = false;

    async function loadClubs() {
      setClubsLoading(true);
      setClubsError("");

      try {
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
        let results = await fetchOpenLibraryBooks(searchTerm);

        if (!results.length && simplifiedSearchTerm !== searchTerm) {
          results = await fetchOpenLibraryBooks(simplifiedSearchTerm);
        }

        setBookSearchResults(results);
        setBookSearchStatus(results.length ? "success" : "error");
        setBookSearchMessage(
          results.length
            ? ""
            : "No ISBN-backed results found. Check the spelling or try the author name.",
        );
      } catch (error) {
        console.error("Failed to search Open Library:", error);
        setBookSearchStatus("error");
        setBookSearchMessage("Book search is unavailable right now. Please try again.");
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [isCreateOpen, newClub.bookTitle, selectedClubBook]);

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
  async function openClubDetails(club) {
    setDetailClubId(club.id);
    setDetailBlurb("");
    setDetailBlurbError("");
    setDetailBlurbLoading(true);

    try {
      const details = await getOpenLibraryBookDetails({
        title: club.bookTitle,
        author: club.author,
        isbn: club.isbn,
        coverUrl: club.coverUrl,
      });

      setDetailBlurb(details.description || "");
      setDetailBlurbError(details.error || "");
    } catch (error) {
      console.error("Failed to load club book details:", error);
      setDetailBlurbError(error.message || "Could not load the official book blurb.");
    } finally {
      setDetailBlurbLoading(false);
    }
  }

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
  async function publishClubPost(event) {
    event.preventDefault();

    if (!requireLogin() || !user?.id) {
      return;
    }

    if (!activeClub || !postDraft.trim()) {
      return;
    }

    setActionLoading(true);
    setActionError("");

    try {
      const createdPost = await createClubPost({
        clubId: activeClub.id,
        userId: user.id,
        message: postDraft,
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
      console.error("Failed to publish club message:", error);
      setActionError(
        error.message || "Could not publish your message.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function createClub(event) {
    event.preventDefault();

    if (!requireLogin() || !user?.id) {
      return;
    }

    if (!selectedClubBook?.isbn) {
      setBookSearchStatus("error");
      setBookSearchMessage(
        "Choose a book from the ISBN search results before creating a club.",
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
        coverUrl: null,
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
    <section className="home-page clubs-page" aria-label="Book clubs">
      {!activeClub && !lockedClub && (
        <>
          <header className="clubs-hero">
            <p className="eyebrow">Book Clubs</p>
            <h1>Find Your Community</h1>
            <p>Join or create a book club- it's all up to you.</p>
          </header>

          <section className="club-toolbar" aria-label="Book club filters">
            <div>
              <p className="eyebrow">Reading Circles</p>
              <h2>Join the Reading Fun</h2>
            </div>
            <label className="club-search-control">
              <span className="sr-only">Search book clubs</span>
              <input
                type="search"
                value={clubSearchQuery}
                onChange={(event) => setClubSearchQuery(event.target.value)}
                placeholder="Search clubs by book, creator, or ..."
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
              Create Club
            </button>
          </section>
        </>
      )}

      {lockedClub && (
        <section className="club-locked-room" aria-label={`${lockedClub.title} locked room`}>
          <Link className="club-room-back" to="/clubs">
            Back to All Clubs
          </Link>
          <div className="club-locked-card">
            <div className="club-detail-cover" aria-hidden="true">
              {lockedClub.isbn && (
                <img
                  src={lockedClub.coverUrl || getCoverUrl(lockedClub.isbn)}
                  alt=""
                  loading="lazy"
                  onError={hideBrokenCover}
                />
              )}
              <span>{lockedClub.bookTitle}</span>
            </div>
            <div>
              <p className="eyebrow">Join Required</p>
              <h2>{lockedClub.title}</h2>
              <p>
                Join this book club first to unlock the discussion room, schedule,
                and reader list.
              </p>
              <button className="primary-button" type="button" onClick={() => joinClub(lockedClub.id)}>
                Join Club
              </button>
            </div>
          </div>
        </section>
      )}

      {activeClub ? (
        <section className="club-room" aria-label={`${activeClub.title} room`}>
          <Link className="club-room-back" to="/clubs">
            Back to All Clubs
          </Link>
          <div className="club-room-heading">
            <div className="club-room-cover" aria-hidden="true">
              {activeClub.isbn && (
                <img
                  src={activeClub.coverUrl || getCoverUrl(activeClub.isbn)}
                  alt=""
                  loading="lazy"
                  onError={hideBrokenCover}
                />
              )}
            </div>
            <div>
              <p className="eyebrow">You Joined</p>
              <h2>{activeClub.title}</h2>
              <p className="club-room-meta">
                <strong>{activeClub.bookTitle}</strong>
                <span>by {activeClub.author}</span>
                <em>Host: {activeClub.creatorName}</em>
              </p>
              <button className="club-danger-action" type="button" onClick={() => quitClub(activeClub.id)}>
                Quit Club
              </button>
              {isClubCreator(activeClub) && (
                <button
                  className="club-danger-action"
                  type="button"
                  onClick={() => deleteClub(activeClub.id)}
                >
                  Delete Club
                </button>
              )}
            </div>
          </div>

          <div className="club-room-grid">
            <section
              className="reading-calendar"
              aria-label="Reading calendar"
            >
              <div className="reading-calendar-heading">
                <p className="eyebrow">
                  Manager Schedule
                </p>

                {isClubCreator(activeClub) && (
                  <button
                    className="ghost-button schedule-edit-button"
                    type="button"
                    onClick={openScheduleEditor}
                  >
                    Edit Schedule
                  </button>
                )}
              </div>
              <div>
                {activeClub.schedule.map((step, index) => (
                  <article key={step.id || `schedule-${index}`}>
                    <span>{step.position || index + 1}</span>

                    <div>
                      <strong>
                        Week {step.position || index + 1}:{" "}
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

            <section className="club-posts" aria-label="Club posts">
              <div className="club-chat-heading">
                <p className="eyebrow">Discussion Room</p>
                <strong>#{activeClub.bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</strong>
              </div>
              <div className="club-post-list">
                {(clubPosts[activeClub.id] || []).length === 0 ? (
                  <p>
                    No messages yet. Start the discussion.
                  </p>
                ) : (
                  (clubPosts[activeClub.id] || []).map((post) => (
                    <article key={post.id}>
                      <span className="message-avatar">
                        {post.authorAvatarUrl ? (
                          <img
                            src={post.authorAvatarUrl}
                            alt=""
                          />
                        ) : (
                          post.authorName.slice(0, 1).toUpperCase()
                        )}
                      </span>

                      <div>
                        <strong>{post.authorName}</strong>

                        {String(post.userId) ===
                          String(activeClub.creatorId) && (
                          <span className="club-host-label">
                            Host
                          </span>
                        )}

                        <small>
                          {new Date(post.createdAt).toLocaleString()}
                        </small>

                        <p>{post.message}</p>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <form className="club-message-form" onSubmit={publishClubPost}>
                <textarea
                  value={postDraft}
                  onChange={(event) => setPostDraft(event.target.value)}
                  placeholder={`Message ${activeClub.title}...`}
                  rows="2"
                />
                <button className="primary-button" type="submit" disabled ={actionLoading}>
                  {actionLoading ? "Sending..." : "Send"}
                </button>
              </form>
            </section>

            <aside className="club-members-panel" aria-label="Club members">
              <p className="eyebrow">Readers</p>
              <strong>{activeClub.memberCount}/{activeClub.membersWanted}</strong>              
              <div>
                {(activeClub.members || []).map((member) => (
                  <span
                    className="member-avatar"
                    key={member.userId}
                    title={member.name}
                  >
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                      />
                    ) : (
                      member.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </section>
      ) : !lockedClub && (
  <>
    {clubsLoading && (
      <p className="club-empty-state">
        Loading reading circles...
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
      <section className="club-grid" aria-label="Available book clubs">
{filteredClubs.map((club) => (
              <article className={`club-card ${club.tone}`} key={club.id}>
                <div className="club-cover" aria-hidden="true">
                  {club.isbn && (
                    <img
                      src={club.coverUrl || getCoverUrl(club.isbn)}
                      alt=""
                      loading="lazy"
                      onError={hideBrokenCover}
                    />
                  )}
                </div>
                <div>
                  <h2>{club.bookTitle}</h2>
                  <p className="club-card-name">{club.title}</p>
                  <small className="club-card-founder">
                    Started by {club.creatorName}
                  </small>
                  <p className="club-card-description">{club.description}</p>
                  {club.tags.length > 0 && (
                    <div className="club-tag-list" aria-label="Club tags">
                      {club.tags.map((tag) => (
                        <span className="club-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="club-capacity">
                    <span style={{ width: `${(club.memberCount / club.membersWanted) * 100}%` }} />
                  </div>
                  <strong>
                    {club.memberCount}/{club.membersWanted} readers
                  </strong>
                  <div className="club-card-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => openClubDetails(club)}
                    >
                      Details
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => joinClub(club.id)}
                      disabled={club.isJoined || actionLoading}
                    >
                      {club.isJoined ? "Joined" : "Join"}
                    </button>
                    {club.isJoined && (
                      <Link className="primary-button" to={`/clubs/${club.id}`}>
                        Open Room
                      </Link>
                    )}
                    {club.isJoined && (
                      <button
                        className="club-danger-action"
                        type="button"
                        onClick={() => quitClub(club.id)}
                      >
                        Quit Club
                      </button>
                    )}
                    {isClubCreator(club) && (
                      <button
                        className="club-danger-action"
                        type="button"
                        onClick={() => deleteClub(club.id)}
                      >
                        Delete Club
                      </button>
                    )}
                  </div>
                </div>
              </article>
          ))}

        {filteredClubs.length === 0 && (
          <p className="club-empty-state">
            {clubs.length === 0
              ? "No reading circles have been created yet. Start the first one when you are ready."
              : "No circles match that search yet. Try another title, creator, or description."}
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
              aria-label="Close club details"
            >
              x
            </button>
              <p className="eyebrow">Before You Join</p>
            <div className="club-detail-cover" aria-hidden="true">
              {detailClub.isbn && (
                <img
                  src={detailClub.coverUrl || getCoverUrl(detailClub.isbn)}
                  alt=""
                  loading="lazy"
                  onError={hideBrokenCover}
                />
              )}
              <span>{detailClub.bookTitle}</span>
            </div>
            <h2 id="club-detail-title">{detailClub.title}</h2>
            <p>
              <strong>{detailClub.bookTitle}</strong> by {detailClub.author}
            </p>
            {detailBlurbLoading ? (
              <p>Loading the official book blurb...</p>
            ) : (
              <p>
                {detailBlurb ||
                  detailBlurbError ||
                  "No official Open Library blurb is available for this book yet."}
              </p>
            )}
            <dl>
              <div>
                <dt>Tags</dt>
                <dd>
                  {detailClub.tags.length > 0
                    ? detailClub.tags.join(", ")
                    : "No tags"}
                </dd>
              </div>
              <div>
                <dt>Started by</dt>
                <dd>{detailClub.creatorName}</dd>
              </div>
              <div>
                <dt>Looking for</dt>
                <dd>{detailClub.membersWanted} readers</dd>
              </div>
              <div>
                <dt>Length</dt>
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
              {detailClub.isJoined ? "Joined - Linked to Profile" : "Join This Club"}
            </button>
            {detailClub.isJoined && (
              <Link className="primary-button full" to={`/clubs/${detailClub.id}`}>
                Open Club Room
              </Link>
            )}
            {detailClub.isJoined && (
              <button
                className="club-danger-action"
                type="button"
                onClick={() => quitClub(detailClub.id)}
              >
                Quit Club
              </button>
            )}
            {isClubCreator(detailClub) && (
              <button
                className="club-danger-action"
                type="button"
                onClick={() => deleteClub(detailClub.id)}
              >
                Delete Club
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
            aria-label="Close schedule editor"
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
                    placeholder="Theme or milestone"
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
                    placeholder="Chapters or pages"
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
                    placeholder="Discussion prompt or instructions"
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
              aria-label="Close create club"
            >
              x
            </button>
            <p className="eyebrow">Start a Circle</p>
            <h2 id="create-club-title">Create a Book Club</h2>
            <div className="create-club-layout">
              <form onSubmit={createClub}>
                <label>
                  <span>Book club name</span>
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
                  <span>Book title</span>
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
                    placeholder="Search title, author, or ISBN..."
                  />
                </label>
                {bookSearchStatus === "loading" && (
                  <p className="book-search-status">Searching the ISBN database...</p>
                )}
                {bookSearchMessage ? (
                  <p className="book-search-status error">{bookSearchMessage}</p>
                ) : null}
                {bookSearchResults.length > 0 && (
                  <div className="book-search-suggestions" aria-label="Book suggestions">
                    {bookSearchResults.map((book) => (
                      <button
                        type="button"
                        className={selectedClubBook?.isbn === book.isbn ? "selected" : ""}
                        key={`${book.openLibraryKey}-${book.isbn}`}
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
                        {book.coverUrl ? (
                          <img src={book.coverUrl} alt="" loading="lazy" onError={hideBrokenCover} />
                        ) : null}
                        <strong>{book.title}</strong>
                        <small>
                          {book.author}
                          {book.firstPublished ? ` / ${book.firstPublished}` : ""} / ISBN {book.isbn}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
                <label>
                  <span>Tags</span>

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
                  <span>Members wanted</span>
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
                  <span>How long</span>
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
                  <legend>Reading schedule</legend>
                  <div className="schedule-builder-list">
                    {(Array.isArray(newClub.schedule) ? newClub.schedule : []).map((step, index) => (
                      <div className="schedule-builder-row" key={`schedule-step-${index + 1}`}>
                        <span>Week {index + 1}</span>
                        <input
                          type="text"
                          value={step.theme}
                          onChange={(event) =>
                            updateScheduleStep(index, "theme", event.target.value)
                          }
                          placeholder="Theme"
                        />
                        <input
                          type="text"
                          value={step.chapters}
                          onChange={(event) =>
                            updateScheduleStep(index, "chapters", event.target.value)
                          }
                          placeholder="Chapters"
                        />
                        <textarea
                          value={step.description}
                          onChange={(event) =>
                            updateScheduleStep(index, "description", event.target.value)
                          }
                          placeholder="Discussion prompt or instructions"
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
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="schedule-add-button" type="button" onClick={addScheduleStep}>
                    Add Week
                  </button>
                </fieldset>
                <label>
                  <span>Description</span>
                  <textarea
                    maxLength="350"
                    value={newClub.description}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, description: event.target.value }))
                    }
                    placeholder="What kind of reading circle are you creating?"
                    rows="4"
                  />
                  <small className="character-count">{newClub.description.length}/350 characters</small>
                </label>
                <button
                  className="primary-button full"
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Creating..." : "Create club"}
                </button>
              </form>
              <aside className="create-club-preview" aria-label="Selected book preview">
                <div className="club-detail-cover">
                  {previewBook.isbn && (
                    <img
                      src={previewBook.coverUrl || getCoverUrl(previewBook.isbn)}
                      alt=""
                      loading="lazy"
                      onError={hideBrokenCover}
                    />
                  )}
                  <span>{previewBook.title}</span>
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
