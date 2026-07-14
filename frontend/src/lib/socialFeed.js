export const HOME_FEED_STORAGE_KEY = "litshelf-home-state-v1";

export function getUserDisplayHandle(user, profile) {
  const displayName =
    profile?.full_name?.trim() ||
    profile?.name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.user_metadata?.name?.trim() ||
    user?.user_metadata?.display_name?.trim();
  const profileUsername =
    profile?.username?.trim() || user?.user_metadata?.username?.trim();
  const emailName = user?.email?.split("@")[0];

  return displayName || profileUsername || emailName || "reader";
}

export function createPublicReviewPost({ book, rating, reviewText, user, profile }) {
  return {
    id: Date.now(),
    student: getUserDisplayHandle(user, profile),
    year: "Reader",
    action: "reviewed",
    book: book.title,
    author: book.author,
    createdAt: new Date().toISOString(),
    mood: "finished",
    place: "your shelf",
    accent: "forest",
    note: reviewText?.trim() || `Rated ${Number(rating).toFixed(1)} / 5.`,
    rating: Number(rating),
    progress: 100,
    shelf: "Finished",
    likes: 0,
    comments: [],
    liked: false,
    draftComment: "",
  };
}

export function addPublicReviewToFeed({ book, rating, reviewText, user, profile }) {
  const post = createPublicReviewPost({ book, rating, reviewText, user, profile });

  try {
    const savedState = JSON.parse(localStorage.getItem(HOME_FEED_STORAGE_KEY));
    const posts = Array.isArray(savedState?.posts) ? savedState.posts : [];

    localStorage.setItem(
      HOME_FEED_STORAGE_KEY,
      JSON.stringify({
        ...savedState,
        posts: [post, ...posts],
      }),
    );
  } catch {
    localStorage.setItem(
      HOME_FEED_STORAGE_KEY,
      JSON.stringify({
        posts: [post],
      }),
    );
  }

  return post;
}
