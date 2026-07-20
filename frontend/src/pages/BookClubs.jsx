import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useRequireLogin } from "../hooks/useRequireLogin";
import { getOpenLibraryBookDetails } from "../lib/openLibrary";
import { getUserProfile } from "../lib/profileApi";
import { getUserDisplayHandle } from "../lib/socialFeed";

const CLUB_STORAGE_KEY = "litshelf-book-clubs-v1";

const clubGenres = ["All", "Fiction", "Essays", "Classics", "Campus", "Memoir"];

const DEMO_CLUB_IDS = new Set([
  "didion-after-school",
  "rooney-room",
  "baldwin-circle",
  "open-city-walkers",
]);

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

function withCoverUrl(club) {
  return {
    ...club,
    schedule: Array.isArray(club.schedule) && club.schedule.length > 0
      ? club.schedule
      : getDefaultSchedule(club.duration),
    members: Array.isArray(club.members) ? club.members : [],
    coverUrl: club.coverUrl || getCoverUrl(club.isbn),
  };
}

function parseSchedule(scheduleText, duration) {
  const lines = Array.isArray(scheduleText)
    ? scheduleText
        .filter((step) => step.theme?.trim() || step.chapters?.trim())
        .map((step, index) => ({
          week: `Week ${index + 1}`,
          milestone: step.theme?.trim() || `Checkpoint ${index + 1}`,
          pages: step.chapters?.trim() || "Reading to be announced",
          note: "",
        }))
    : scheduleText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

  if (lines.length === 0) {
    return getDefaultSchedule(duration);
  }

  if (Array.isArray(scheduleText)) {
    return lines;
  }

  return lines.map((line, index) => ({
    week: `Week ${index + 1}`,
    milestone: line.split(":")[0] || `Checkpoint ${index + 1}`,
    pages: line.includes(":") ? line.split(":").slice(1).join(":").trim() : "Manager-set reading",
    note: "",
  }));
}

function getInitialClubState() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLUB_STORAGE_KEY));

    if (!saved) {
      return {
        joinedIds: [],
        clubs: [],
        posts: {},
      };
    }

    const clubState = {
      joinedIds: Array.isArray(saved.joinedIds)
        ? saved.joinedIds.filter((clubId) => !DEMO_CLUB_IDS.has(clubId))
        : [],
      clubs: Array.isArray(saved.clubs)
        ? saved.clubs
            .filter((club) => !DEMO_CLUB_IDS.has(club.id))
            .map((club) => withCoverUrl({ genre: "Fiction", ...club }))
        : [],
      posts: saved.posts || {},
    };

    localStorage.setItem(CLUB_STORAGE_KEY, JSON.stringify(clubState));
    return clubState;
  } catch {
    return {
      joinedIds: [],
      clubs: [],
      posts: {},
    };
  }
}

function BookClubs() {
  const { requireLogin, user } = useRequireLogin();
  const navigate = useNavigate();
  const { clubId } = useParams();
  const [initialState] = useState(getInitialClubState);
  const [clubs, setClubs] = useState(initialState.clubs);
  const [joinedIds, setJoinedIds] = useState(initialState.joinedIds);
  const [clubPosts, setClubPosts] = useState(initialState.posts);
  const [detailClubId, setDetailClubId] = useState(null);
  const [detailBlurb, setDetailBlurb] = useState("");
  const [detailBlurbLoading, setDetailBlurbLoading] = useState(false);
  const [detailBlurbError, setDetailBlurbError] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [genreFilter, setGenreFilter] = useState("All");
  const [clubSearchQuery, setClubSearchQuery] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [newClub, setNewClub] = useState({
    creator: "",
    clubName: "",
    bookTitle: "",
    membersWanted: "10",
    duration: "4 weeks",
    schedule: [
      { theme: "Opening chapters", chapters: "Chapters 1-4" },
      { theme: "First half", chapters: "Chapters 5-8" },
      { theme: "Finish the book", chapters: "Chapters 9-end" },
      { theme: "Final reflection", chapters: "Full book" },
    ],
    genre: "Fiction",
    description: "",
  });
  const [bookSearchResults, setBookSearchResults] = useState([]);
  const [bookSearchStatus, setBookSearchStatus] = useState("idle");
  const [bookSearchMessage, setBookSearchMessage] = useState("");
  const [selectedClubBook, setSelectedClubBook] = useState(null);
  const [profile, setProfile] = useState(null);

  const detailClub = clubs.find((club) => club.id === detailClubId);
  const routeClub = clubs.find((club) => club.id === clubId);
  const lockedClub = routeClub && !joinedIds.includes(routeClub.id) ? routeClub : null;
  const activeClub = routeClub && joinedIds.includes(routeClub.id) ? routeClub : null;
  const currentReaderName = getUserDisplayHandle(user, profile);
  const displayReaderName = (name) =>
    name === "Anonymous Reader" || name === "You" ? currentReaderName : name;
  const normalizedClubSearch = clubSearchQuery.trim().toLowerCase();
  const filteredClubs = clubs.filter((club) => {
    const matchesGenre = genreFilter === "All" || club.genre === genreFilter;
    const matchesSearch =
      !normalizedClubSearch ||
      [
        club.title,
        club.bookTitle,
        club.author,
        club.creator,
        club.genre,
        club.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedClubSearch);

    return matchesGenre && matchesSearch;
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

  function saveState(nextState) {
    localStorage.setItem(CLUB_STORAGE_KEY, JSON.stringify(nextState));
  }

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

  function joinClub(clubId) {
    if (!requireLogin()) return;
    const nextJoinedIds = joinedIds.includes(clubId) ? joinedIds : [...joinedIds, clubId];
    const nextClubs = clubs.map((club) =>
      club.id === clubId && !joinedIds.includes(clubId)
        ? {
            ...club,
            membersJoined: Math.min(club.membersJoined + 1, club.membersWanted),
            members: Array.from(new Set([...(club.members || []), currentReaderName])),
          }
        : club,
    );

    setJoinedIds(nextJoinedIds);
    setClubs(nextClubs);
    setDetailClubId(null);
    saveState({ joinedIds: nextJoinedIds, clubs: nextClubs, posts: clubPosts });
  }

  function quitClub(clubId) {
     if (!requireLogin()) return;
    const nextJoinedIds = joinedIds.filter((joinedId) => joinedId !== clubId);
    const nextClubs = clubs.map((club) =>
      club.id === clubId && joinedIds.includes(clubId)
        ? {
            ...club,
            membersJoined: Math.max(club.membersJoined - 1, 0),
            members: (club.members || []).filter(
              (member) => displayReaderName(member) !== currentReaderName,
            ),
          }
        : club,
    );

    setJoinedIds(nextJoinedIds);
    setClubs(nextClubs);
    setDetailClubId(null);
    saveState({ joinedIds: nextJoinedIds, clubs: nextClubs, posts: clubPosts });

    if (clubId === activeClub?.id) {
      navigate("/clubs");
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
      schedule: [...(Array.isArray(draft.schedule) ? draft.schedule : []), { theme: "", chapters: "" }],
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

  function publishClubPost(event) {
    if (!requireLogin()) return;
    event.preventDefault();

    if (!activeClub || !postDraft.trim()) {
      return;
    }

    const nextPosts = {
      ...clubPosts,
      [activeClub.id]: [
        {
          id: `${activeClub.id}-message-${(clubPosts[activeClub.id]?.length || 0) + 1}`,
          author: currentReaderName,
          body: postDraft.trim(),
          time: "just now",
        },
        ...(clubPosts[activeClub.id] || []),
      ],
    };

    setClubPosts(nextPosts);
    setPostDraft("");
    saveState({ joinedIds, clubs, posts: nextPosts });
  }

  function createClub(event) {
    event.preventDefault();
    if (!requireLogin()) return;
    const selectedBook = selectedClubBook || bookSearchResults[0];

    if (!selectedBook?.isbn) {
      setBookSearchStatus("error");
      setBookSearchMessage("Choose a book from the ISBN search results before creating a club.");
      return;
    }

    const creator = newClub.creator.trim() || currentReaderName;
    const clubName = newClub.clubName.trim() || `${selectedBook.title} Circle`;
    const matchingTitleCount = clubs.filter((club) => club.bookTitle === selectedBook.title).length;
    const id = `${selectedBook.title}-${clubName}-${creator}-${matchingTitleCount + 1}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    const createdClub = {
      id,
      title: clubName,
      bookTitle: selectedBook.title,
      author: selectedBook.author,
      creator,
      membersWanted: Number(newClub.membersWanted) || 8,
      membersJoined: 1,
      duration: newClub.duration,
      schedule: parseSchedule(newClub.schedule, newClub.duration),
      genre: newClub.genre,
      tone: "navy",
      description:
        newClub.description.trim().slice(0, 350) ||
        "A new reading circle for people who want to read slowly, talk honestly, and keep each other turning pages.",
      isbn: selectedBook.isbn,
      coverUrl: selectedBook.coverUrl || getCoverUrl(selectedBook.isbn),
      members: Array.from(new Set([creator, currentReaderName])),
    };

    const nextClubs = [createdClub, ...clubs];
    const nextJoinedIds = [createdClub.id, ...joinedIds];

    setClubs(nextClubs);
    setJoinedIds(nextJoinedIds);
    setGenreFilter("All");
    setDetailClubId(null);
    setIsCreateOpen(false);
    setNewClub({
      creator: "",
      clubName: "",
      bookTitle: "",
      membersWanted: "10",
      duration: "4 weeks",
      schedule: [
        { theme: "Opening chapters", chapters: "Chapters 1-4" },
        { theme: "First half", chapters: "Chapters 5-8" },
        { theme: "Finish the book", chapters: "Chapters 9-end" },
        { theme: "Final reflection", chapters: "Full book" },
      ],
      genre: "Fiction",
      description: "",
    });
    setSelectedClubBook(null);
    setBookSearchResults([]);
    setBookSearchStatus("idle");
    setBookSearchMessage("");
    saveState({ joinedIds: nextJoinedIds, clubs: nextClubs, posts: clubPosts });
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
            <div className="genre-filter-list">
              {clubGenres.map((genre) => (
                <button
                  className={genreFilter === genre ? "genre-filter active" : "genre-filter"}
                  type="button"
                  key={genre}
                  onClick={() => setGenreFilter(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
            <label className="club-search-control">
              <span className="sr-only">Search book clubs</span>
              <input
                type="search"
                value={clubSearchQuery}
                onChange={(event) => setClubSearchQuery(event.target.value)}
                placeholder="Search clubs by book, creator, or genre..."
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
                <em>Host: {displayReaderName(activeClub.creator)}</em>
              </p>
              <button className="club-danger-action" type="button" onClick={() => quitClub(activeClub.id)}>
                Quit Club
              </button>
            </div>
          </div>

          <div className="club-room-grid">
            <section className="reading-calendar" aria-label="Reading calendar">
              <p className="eyebrow">Manager Schedule</p>
              <div>
                {activeClub.schedule.map((step, index) => (
                  <article key={step.week}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.week}: {step.milestone}</strong>
                      <small>{step.pages}</small>
                      {step.note && step.note !== "Set by the club manager." ? (
                        <p>{step.note}</p>
                      ) : null}
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
                {(clubPosts[activeClub.id] || [
                  {
                    id: "starter",
                    author: activeClub.creator,
                    body: "Welcome in. Post your favorite line before our first meeting.",
                    time: "pinned",
                  },
                ]).map((post) => (
                  <article key={post.id}>
                    <span className="message-avatar">{displayReaderName(post.author).slice(0, 1)}</span>
                    <div>
                      <strong>{displayReaderName(post.author)}</strong>
                      {displayReaderName(post.author) === displayReaderName(activeClub.creator) && (
                        <span className="club-host-label">Host</span>
                      )}
                      <small>{post.time}</small>
                      <p>{post.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <form className="club-message-form" onSubmit={publishClubPost}>
                <textarea
                  value={postDraft}
                  onChange={(event) => setPostDraft(event.target.value)}
                  placeholder={`Message ${activeClub.title}...`}
                  rows="2"
                />
                <button className="primary-button" type="submit">
                  Send
                </button>
              </form>
            </section>

            <aside className="club-members-panel" aria-label="Club members">
              <p className="eyebrow">Readers</p>
              <strong>{activeClub.membersJoined}/{activeClub.membersWanted}</strong>
              <div>
                {(activeClub.members || []).map((member) => (
                  <span className="member-avatar" key={member} title={displayReaderName(member)}>
                    {displayReaderName(member).slice(0, 1)}
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </section>
      ) : !lockedClub && (
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
                    Started by {displayReaderName(club.creator)}
                  </small>
                  <p className="club-card-description">{club.description}</p>
                  <div className="club-capacity">
                    <span style={{ width: `${(club.membersJoined / club.membersWanted) * 100}%` }} />
                  </div>
                  <strong>
                    {club.membersJoined}/{club.membersWanted} readers
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
                      disabled={joinedIds.includes(club.id)}
                    >
                      {joinedIds.includes(club.id) ? "Joined" : "Join"}
                    </button>
                    {joinedIds.includes(club.id) && (
                      <Link className="primary-button" to={`/clubs/${club.id}`}>
                        Open Room
                      </Link>
                    )}
                    {joinedIds.includes(club.id) && (
                      <button
                        className="club-danger-action"
                        type="button"
                        onClick={() => quitClub(club.id)}
                      >
                        Quit Club
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
                : "No circles match that search yet. Try another title, creator, or genre."}
            </p>
          )}
        </section>
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
                <dt>Genre</dt>
                <dd>{detailClub.genre}</dd>
              </div>
              <div>
                <dt>Started by</dt>
                <dd>{displayReaderName(detailClub.creator)}</dd>
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
              disabled={joinedIds.includes(detailClub.id)}
            >
              {joinedIds.includes(detailClub.id) ? "Joined - Linked to Profile" : "Join This Club"}
            </button>
            {joinedIds.includes(detailClub.id) && (
              <Link className="primary-button full" to={`/clubs/${detailClub.id}`}>
                Open Club Room
              </Link>
            )}
            {joinedIds.includes(detailClub.id) && (
              <button
                className="club-danger-action"
                type="button"
                onClick={() => quitClub(detailClub.id)}
              >
                Quit Club
              </button>
            )}
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
                  <span>Your name</span>
                  <input
                    type="text"
                    value={newClub.creator}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, creator: event.target.value }))
                    }
                    placeholder={currentReaderName}
                  />
                </label>
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
                  <span>Genre</span>
                  <select
                    value={newClub.genre}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, genre: event.target.value }))
                    }
                  >
                    {clubGenres
                      .filter((genre) => genre !== "All")
                      .map((genre) => (
                        <option value={genre} key={genre}>
                          {genre}
                        </option>
                      ))}
                  </select>
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
                <button className="primary-button full" type="submit">
                  Create club
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
