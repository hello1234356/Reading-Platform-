import { useEffect, useState } from "react";
import { getPublicProfile } from "../lib/publicProfileApi";
import { getPublicDisplayName } from "../lib/identity";
import BookCoverImage from "./BookCoverImage";
import { useTranslation } from "react-i18next";

export default function PublicProfileModal({
  userId,
  onClose,
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    async function loadPublicProfile() {
      setProfileLoading(true);
      setProfileError("");
      setProfile(null);

      try {
        const data = await getPublicProfile(userId);

        if (!cancelled) {
          setProfile(data);
        }
      } catch (error) {
        console.error("Failed to load public profile:", error);

        if (!cancelled) {
          setProfileError(
            error.message || t("profile.loadError"),
          );
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadPublicProfile();

    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  useEffect(() => {
    if (!userId) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userId, onClose]);

  const displayName = getPublicDisplayName(profile);
  const officialName = profile?.full_name?.trim() || t("profile.reader");

  if (!userId) {
    return null;
  }

  return (
    <div
      className="public-profile-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <article
        className="public-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-profile-title"
      >
        <button
          className="modal-close"
          type="button"
          aria-label={t("profile.closeProfile")}
          onClick={onClose}
        >
          ×
        </button>

        {profileLoading ? (
          <p className="public-profile-status">
            {t("profile.loadingProfile")}
          </p>
        ) : profileError ? (
          <div className="public-profile-status">
            <p className="eyebrow">{t("profile.unavailable")}</p>
            <p>{profileError}</p>
          </div>
        ) : profile ? (
          <>
            <header className="public-profile-header">
              <div className="public-profile-avatar">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={t("profile.profileAlt", { name: displayName })}
                  />
                ) : (
                  <span aria-hidden="true">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="public-profile-identity">
                <p className="eyebrow">{t("profile.readerProfile")}</p>

                <h2 id="public-profile-title">
                  {displayName}
                </h2>

                <div className="public-profile-meta">
                  <span>
                    {officialName}
                    {profile.grade ? ` · G${profile.grade}` : ""}
                  </span>
                </div>
              </div>
            </header>

            <section className="public-profile-section">
              <h3>{t("profile.bio")}</h3>

              <p>
                {profile.bio?.trim() ||
                  t("profile.noBio")}
              </p>
            </section>

            <section className="public-profile-section">
              <h3>{t("profile.fourFavorites")}</h3>

              {profile.favoriteBooks?.length > 0 ? (
                <div className="public-profile-favorites">
                  {profile.favoriteBooks.map(
                    (book, index) => (
                      <article
                        className="public-profile-favorite"
                        key={`${book.isbn}-${index}`}
                      >
                        <div className="public-profile-cover">
                          <BookCoverImage
                            src={book.coverUrl}
                            alt={t("books.coverAlt", { title: book.title })}
                            decorative
                            loading="lazy"
                          />
                        </div>

                        <strong>{book.title}</strong>
                        <small>{book.author}</small>
                      </article>
                    ),
                  )}
                </div>
              ) : (
                <p className="public-profile-empty">
                  {t("profile.noFavorites")}
                </p>
              )}
            </section>
          </>
        ) : null}
      </article>
    </div>
  );
}
