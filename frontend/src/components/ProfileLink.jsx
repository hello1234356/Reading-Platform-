import { usePublicProfile } from "../context/PublicProfileContext";

export default function ProfileLink({
  userId,
  children,
  variant = "name",
  className = "",
  ariaLabel,
  disabled = false,
}) {
  const { openProfile } = usePublicProfile();

  const variantClass =
    variant === "avatar"
      ? "user-profile-avatar-button"
      : "user-profile-link";

  const combinedClassName = [
    variantClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={combinedClassName}
      type="button"
      disabled={disabled || !userId}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        openProfile(userId);
      }}
    >
      {children}
    </button>
  );
}