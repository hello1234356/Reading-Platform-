import ClubRoom from "../components/clubs/ClubRoom";
import ClubBookPicker from "../components/clubs/ClubBookPicker";
import ClubScheduleEditor from "../components/clubs/ClubScheduleEditor";
import {
  useEffect,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRequireLogin } from "../hooks/useRequireLogin";
import BookCoverImage from "../components/BookCoverImage";
import {
  archiveInactiveBookClubs,
  createBookClub,
  deleteBookClub,
  getBookClubs,
  joinBookClub,
  leaveBookClub,
} from "../lib/bookClubApi";
import ProfileLink from "../components/ProfileLink";


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

function BookClubs() {
  const { t } = useTranslation();
  const { requireLogin, user } = useRequireLogin();
  const navigate = useNavigate();
  const { clubId } = useParams();
 const [clubs, setClubs] = useState([]);
  const [clubsLoading, setClubsLoading] = useState(true);
  const [clubsError, setClubsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);  
  const [detailClubId, setDetailClubId] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [clubSearchQuery, setClubSearchQuery] = useState("");
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
  const [selectedClubBook, setSelectedClubBook] = useState(null);
  const detailClub = clubs.find(
    (club) => String(club.id) === String(detailClubId),
  );

  const routeClub = clubs.find(
    (club) => String(club.id) === String(clubId),
  );

  const lockedClub =
    routeClub && !routeClub.isJoined ? routeClub : null;

  const activeClub = routeClub?.isJoined ? routeClub : null;
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
    {
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

    if (!window.confirm(t("clubRoom.confirmLeave"))) return;
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

  async function createClub(event) {
    event.preventDefault();

    if (!requireLogin() || !user?.id) {
      return;
    }

    if (!canPersistBook(selectedClubBook)) {
      setActionError(t("clubRoom.chooseBook"));
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
          <section className="club-toolbar" aria-label={t("clubs.filters")}>
            <div>
              <p className="eyebrow">{t("clubs.readingCircles")}</p>
              <h1>{t("clubs.joinFun")}</h1>
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
        <ClubRoom key={activeClub.id} initialClub={activeClub} user={user} onClubUpdated={next => setClubs(current => current.map(club => club.id === next.id ? next : club))} />
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
                    {club.isJoined && !isClubCreator(club) && (
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
            {detailClub.isJoined && !isClubCreator(detailClub) && (
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
                {actionError && <p role="alert" className="cr-error">{actionError}</p>}
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
                <ClubBookPicker value={selectedClubBook} onChange={setSelectedClubBook} />
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
                <h3>{t("clubs.readingSchedule")}</h3>
                <ClubScheduleEditor value={newClub.schedule.map(step => ({ ...step, title: step.theme }))} onChange={stages => setNewClub(draft => ({ ...draft, schedule: stages.map(stage => ({ ...stage, theme: stage.title })) }))} />
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
