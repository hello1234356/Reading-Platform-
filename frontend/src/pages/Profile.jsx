import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const CLUB_STORAGE_KEY = "litshelf-book-clubs-v1";

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

function Profile() {
  const navigate = useNavigate();
  const { user, isLoggedIn, loading } = useAuth();

  if (loading) {
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

  const joinedClubs = getJoinedClubs();

  return (
    <section className="home-page profile-page" aria-label="Personal profile">
      <header className="profile-hero">
        <div className="profile-photo" aria-hidden="true">
          {user?.email?.slice(0, 1).toUpperCase() || "Y"}
        </div>
        <div>
          <p className="eyebrow">Personal Profile</p>
          <h1>Your Reading Journal</h1>
          <p>{user?.email}</p>
        </div>
      </header>

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
    </section>
  );
}

export default Profile;