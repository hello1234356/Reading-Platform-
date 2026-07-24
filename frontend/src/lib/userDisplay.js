export function getUserDisplayHandle(user, profile) {
  const profileUsername =
    profile?.username?.trim() ||
    user?.user_metadata?.username?.trim();

  const usernameHandle =
    profileUsername?.replace(/\s+/g, "");

  const displayName =
    profile?.full_name?.trim() ||
    profile?.name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.user_metadata?.name?.trim() ||
    user?.user_metadata?.display_name?.trim();

  const emailName =
    user?.email?.split("@")[0];

  return (
    usernameHandle ||
    displayName ||
    emailName ||
    "reader"
  );
}