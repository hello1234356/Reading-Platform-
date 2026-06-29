import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { bookDatabasePreview } from "../data/books";

const CLUB_STORAGE_KEY = "litshelf-book-clubs-v1";

const clubGenres = ["All", "Fiction", "Essays", "Classics", "Campus", "Memoir"];

const defaultMembers = ["Maya C.", "Julian R.", "Anika S.", "Theo L.", "Carrie L.", "Jenna W."];

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

function withCoverUrl(club) {
  return {
    ...club,
    schedule: Array.isArray(club.schedule) && club.schedule.length > 0
      ? club.schedule
      : getDefaultSchedule(club.duration),
    members: Array.isArray(club.members) && club.members.length > 0
      ? club.members
      : defaultMembers.slice(0, Math.min(club.membersJoined || 4, defaultMembers.length)),
    coverUrl: club.coverUrl || getCoverUrl(club.isbn),
  };
}

function parseSchedule(scheduleText, duration) {
  const lines = scheduleText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return getDefaultSchedule(duration);
  }

  return lines.map((line, index) => ({
    week: `Week ${index + 1}`,
    milestone: line.split(":")[0] || `Checkpoint ${index + 1}`,
    pages: line.includes(":") ? line.split(":").slice(1).join(":").trim() : "Manager-set reading",
    note: "Set by the club manager.",
  }));
}

const starterClubs = [
  {
    id: "didion-after-school",
    title: "Didion After School",
    bookTitle: "Slouching Towards Bethlehem",
    author: "Joan Didion",
    creator: "Jenna W.",
    membersWanted: 12,
    membersJoined: 7,
    duration: "4 weeks",
    genre: "Essays",
    tone: "navy",
    description:
      "For readers who like essays that feel like overheard city weather. We meet once a week to talk about voice, place, and sentences worth underlining.",
    isbn: "9780374531386",
    coverUrl: getCoverUrl("9780374531386"),
    members: ["Jenna W.", "Maya C.", "Noah H.", "Claire S.", "Ari K.", "Yiru Z.", "You"],
    schedule: getDefaultSchedule("4 weeks"),
  },
  {
    id: "rooney-room",
    title: "The Rooney Room",
    bookTitle: "Normal People",
    author: "Sally Rooney",
    creator: "Carrie L.",
    membersWanted: 10,
    membersJoined: 6,
    duration: "3 weeks",
    genre: "Fiction",
    tone: "sea",
    description:
      "A quiet circle for contemporary fiction, complicated friendships, and books that make ordinary conversations feel charged.",
    isbn: "9781984822178",
    coverUrl: getCoverUrl("9781984822178"),
    members: ["Carrie L.", "Emily W.", "Jason T.", "Mia Q.", "Leo N.", "Sasha P."],
    schedule: getDefaultSchedule("3 weeks"),
  },
  {
    id: "baldwin-circle",
    title: "Baldwin Circle",
    bookTitle: "Giovanni's Room",
    author: "James Baldwin",
    creator: "Yiru Z.",
    membersWanted: 14,
    membersJoined: 9,
    duration: "5 weeks",
    genre: "Classics",
    tone: "terracotta",
    description:
      "Close reading, honest conversation, and a shared doc for favorite passages. Best for people who like talking about character choices after class.",
    isbn: "9780345806567",
    coverUrl: getCoverUrl("9780345806567"),
    members: ["Yiru Z.", "Theo L.", "Iris M.", "Ben A.", "Lina H.", "Tara S.", "Evan C.", "Mei F.", "Nora J."],
    schedule: getDefaultSchedule("5 weeks"),
  },
  {
    id: "open-city-walkers",
    title: "Open City Walkers",
    bookTitle: "Open City",
    author: "Teju Cole",
    creator: "Mina R.",
    membersWanted: 8,
    membersJoined: 4,
    duration: "4 weeks",
    genre: "Campus",
    tone: "forest",
    description:
      "Reading as wandering. Each week pairs chapters with a walk, a photo, or one small observation from the city.",
    isbn: "9780812980097",
    coverUrl: getCoverUrl("9780812980097"),
    members: ["Mina R.", "Anika S.", "Kai W.", "Sofia P."],
    schedule: getDefaultSchedule("4 weeks"),
  },
];

function getInitialClubState() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLUB_STORAGE_KEY));

    if (!saved) {
      return {
        joinedIds: [],
        clubs: starterClubs.map(withCoverUrl),
        posts: {},
      };
    }

    return {
      joinedIds: Array.isArray(saved.joinedIds) ? saved.joinedIds : [],
      clubs: Array.isArray(saved.clubs)
        ? saved.clubs.map((club) => withCoverUrl({ genre: "Fiction", ...club }))
        : starterClubs.map(withCoverUrl),
      posts: saved.posts || {},
    };
  } catch {
    return {
      joinedIds: [],
      clubs: starterClubs.map(withCoverUrl),
      posts: {},
    };
  }
}

function BookClubs() {
  const navigate = useNavigate();
  const { clubId } = useParams();
  const [initialState] = useState(getInitialClubState);
  const [clubs, setClubs] = useState(initialState.clubs);
  const [joinedIds, setJoinedIds] = useState(initialState.joinedIds);
  const [clubPosts, setClubPosts] = useState(initialState.posts);
  const [detailClubId, setDetailClubId] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [genreFilter, setGenreFilter] = useState("All");
  const [postDraft, setPostDraft] = useState("");
  const [newClub, setNewClub] = useState({
    creator: "",
    bookTitle: bookDatabasePreview[0].title,
    membersWanted: "10",
    duration: "4 weeks",
    schedule: "Week 1: Opening chapters\nWeek 2: First half\nWeek 3: Finish the book\nWeek 4: Final reflection",
    genre: "Fiction",
    description: "",
  });

  const detailClub = clubs.find((club) => club.id === detailClubId);
  const routeClub = clubs.find((club) => club.id === clubId);
  const lockedClub = routeClub && !joinedIds.includes(routeClub.id) ? routeClub : null;
  const activeClub = routeClub && joinedIds.includes(routeClub.id) ? routeClub : null;
  const filteredClubs =
    genreFilter === "All" ? clubs : clubs.filter((club) => club.genre === genreFilter);

  const bookOptions = useMemo(
    () =>
      bookDatabasePreview.map((book) => ({
        title: book.title,
        author: book.author,
        isbn: book.isbn,
      })),
    [],
  );
  const matchingBookOptions = bookOptions
    .filter((book) =>
      `${book.title} ${book.author} ${book.isbn}`
        .toLowerCase()
        .includes(newClub.bookTitle.trim().toLowerCase()),
    )
    .slice(0, 4);
  const previewBook =
    bookOptions.find((book) => book.title === newClub.bookTitle) ||
    matchingBookOptions[0] || {
      title: newClub.bookTitle.trim() || "Search for a book",
      author: "Author will sync from the ISBN database",
      isbn: "Pending ISBN",
    };

  function saveState(nextState) {
    localStorage.setItem(CLUB_STORAGE_KEY, JSON.stringify(nextState));
  }

  function joinClub(clubId) {
    const nextJoinedIds = joinedIds.includes(clubId) ? joinedIds : [...joinedIds, clubId];
    const nextClubs = clubs.map((club) =>
      club.id === clubId && !joinedIds.includes(clubId)
        ? {
            ...club,
            membersJoined: Math.min(club.membersJoined + 1, club.membersWanted),
            members: Array.from(new Set([...(club.members || []), "You"])),
          }
        : club,
    );

    setJoinedIds(nextJoinedIds);
    setClubs(nextClubs);
    setDetailClubId(null);
    saveState({ joinedIds: nextJoinedIds, clubs: nextClubs, posts: clubPosts });
  }

  function quitClub(clubId) {
    const nextJoinedIds = joinedIds.filter((joinedId) => joinedId !== clubId);
    const nextClubs = clubs.map((club) =>
      club.id === clubId && joinedIds.includes(clubId)
        ? {
            ...club,
            membersJoined: Math.max(club.membersJoined - 1, 0),
            members: (club.members || []).filter((member) => member !== "You"),
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

  function publishClubPost(event) {
    event.preventDefault();

    if (!activeClub || !postDraft.trim()) {
      return;
    }

    const nextPosts = {
      ...clubPosts,
      [activeClub.id]: [
        {
          id: Date.now(),
          author: "You",
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

    const selectedBook = previewBook;
    const creator = newClub.creator.trim() || "Anonymous Reader";
    const matchingTitleCount = clubs.filter((club) => club.bookTitle === selectedBook.title).length;
    const id = `${selectedBook.title}-${creator}-${matchingTitleCount + 1}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    const createdClub = {
      id,
      title: `${selectedBook.title} Circle`,
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
        newClub.description.trim() ||
        "A new reading circle for people who want to read slowly, talk honestly, and keep each other turning pages.",
      isbn: selectedBook.isbn,
      coverUrl: getCoverUrl(selectedBook.isbn),
      members: Array.from(new Set([creator, "You"])),
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
      bookTitle: bookDatabasePreview[0].title,
      membersWanted: "10",
      duration: "4 weeks",
      schedule: "Week 1: Opening chapters\nWeek 2: First half\nWeek 3: Finish the book\nWeek 4: Final reflection",
      genre: "Fiction",
      description: "",
    });
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
            <button className="primary-button" type="button" onClick={() => setIsCreateOpen(true)}>
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
              <p>
                {activeClub.bookTitle} by {activeClub.author} | managed by{" "}
                {activeClub.creator}
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
                      <p>{step.note}</p>
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
                    <span className="message-avatar">{post.author.slice(0, 1)}</span>
                    <div>
                      <strong>{post.author}</strong>
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
                  <span className="member-avatar" key={member} title={member}>
                    {member.slice(0, 1)}
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
                  <span>{club.bookTitle}</span>
                </div>
                <div>
                  <p>{club.title}</p>
                  <h2>{club.bookTitle}</h2>
                  <small>Started by {club.creator}</small>
                  <span className="club-genre">{club.genre}</span>
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
                      onClick={() => setDetailClubId(club.id)}
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
              No circles in this genre yet. Start one and make the first shelf.
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
            <p>{detailClub.description}</p>
            <dl>
              <div>
                <dt>Genre</dt>
                <dd>{detailClub.genre}</dd>
              </div>
              <div>
                <dt>Started by</dt>
                <dd>{detailClub.creator}</dd>
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
                    placeholder="Carrie L."
                  />
                </label>
                <label className="book-search-field">
                  <span>Book title</span>
                  <input
                    type="search"
                    value={newClub.bookTitle}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, bookTitle: event.target.value }))
                    }
                    placeholder="Search title, author, or ISBN..."
                  />
                </label>
                {matchingBookOptions.length > 0 && (
                  <div className="book-search-suggestions" aria-label="Book suggestions">
                    {matchingBookOptions.map((book) => (
                      <button
                        type="button"
                        key={book.isbn}
                        onClick={() =>
                          setNewClub((draft) => ({ ...draft, bookTitle: book.title }))
                        }
                      >
                        <strong>{book.title}</strong>
                        <small>{book.author}</small>
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
                <label>
                  <span>Reading schedule</span>
                  <textarea
                    value={newClub.schedule}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, schedule: event.target.value }))
                    }
                    placeholder={"Week 1: Chapters 1-4\nWeek 2: Chapters 5-8"}
                    rows="4"
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    value={newClub.description}
                    onChange={(event) =>
                      setNewClub((draft) => ({ ...draft, description: event.target.value }))
                    }
                    placeholder="What kind of reading circle are you creating?"
                    rows="4"
                  />
                </label>
                <button className="primary-button full" type="submit">
                  Create club
                </button>
              </form>
              <aside className="create-club-preview" aria-label="Selected book preview">
                <div className="club-detail-cover">
                  {previewBook.isbn && (
                    <img
                      src={getCoverUrl(previewBook.isbn)}
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
