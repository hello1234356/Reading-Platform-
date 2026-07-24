function UserAvatar({
  avatarUrl,
  name,
  size = "medium",
  className = "",
}) {
  const initial =
    name?.trim()?.slice(0, 1)?.toUpperCase() || "?";

  return (
    <div
      className={`user-avatar user-avatar-${size} ${className}`.trim()}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${name || "User"}'s profile`}
          loading="lazy"
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}

export default UserAvatar;