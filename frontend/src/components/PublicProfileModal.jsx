import { useEffect, useState } from "react";
import { getPublicProfile } from "../lib/publicProfileApi";
import { getPublicDisplayName } from "../lib/identity";

export default function PublicProfileModal({
  userId,
  onClose,
}) {
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
            error.message || "Could not load this profile.",
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
  }, [userId]);

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
  const officialName = profile?.full_name?.trim() || "Reader";

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
          aria-label="Close profile"
          onClick={onClose}
        >
          ×
        </button>

        {profileLoading ? (
          <p className="public-profile-status">
            Loading profile...
          </p>
        ) : profileError ? (
          <div className="public-profile-status">
            <p className="eyebrow">Profile unavailable</p>
            <p>{profileError}</p>
          </div>
        ) : profile ? (
          <>
            <header className="public-profile-header">
              <div className="public-profile-avatar">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={`${displayName}'s profile`}
                  />
                ) : (
                  <span aria-hidden="true">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="public-profile-identity">
                <p className="eyebrow">Reader Profile</p>

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
              <h3>Bio</h3>

              <p>
                {profile.bio?.trim() ||
                  "This reader has not added a bio yet."}
              </p>
            </section>

            <section className="public-profile-section">
              <h3>Four Favorites</h3>

              {profile.favoriteBooks?.length > 0 ? (
                <div className="public-profile-favorites">
                  {profile.favoriteBooks.map(
                    (book, index) => (
                      <article
                        className="public-profile-favorite"
                        key={`${book.isbn}-${index}`}
                      >
                        <div className="public-profile-cover">
                          {book.coverUrl ? (
                            <img
                              src={book.coverUrl}
                              alt={`Cover of ${book.title}`}
                              loading="lazy"
                            />
                          ) : (
                            <span>No cover</span>
                          )}
                        </div>

                        <strong>{book.title}</strong>
                        <small>{book.author}</small>
                      </article>
                    ),
                  )}
                </div>
              ) : (
                <p className="public-profile-empty">
                  No favorite books selected yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </article>
    </div>
  );
}
