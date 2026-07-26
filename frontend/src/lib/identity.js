const PUBLIC_NAME_FALLBACK = "Reader";

function titleCaseNamePart(part) {
  return part
    .split(/([-'])/)
    .map((segment) => {
      if (segment === "-" || segment === "'") {
        return segment;
      }

      return segment
        ? segment.slice(0, 1).toUpperCase() + segment.slice(1).toLowerCase()
        : "";
    })
    .join("");
}

export function getPublicDisplayName(profile) {
  return (
    profile?.username?.trim() ||
    profile?.full_name?.trim() ||
    PUBLIC_NAME_FALLBACK
  );
}

export function schoolEmailToOfficialName(email) {
  if (typeof email !== "string") {
    return PUBLIC_NAME_FALLBACK;
  }

  const normalizedEmail = email.trim().normalize("NFKC");
  const atIndex = normalizedEmail.indexOf("@");

  if (atIndex <= 0) {
    return PUBLIC_NAME_FALLBACK;
  }

  const localPart = normalizedEmail.slice(0, atIndex);
  const withoutGraduationYear = localPart.replace(/_\d{2}$/u, "");
  const nameParts = withoutGraduationYear.split(".").filter(Boolean);

  if (
    nameParts.length === 0 ||
    nameParts.some((part) => !/^[\p{L}]+(?:[-'][\p{L}]+)*$/u.test(part))
  ) {
    return PUBLIC_NAME_FALLBACK;
  }

  return nameParts.map(titleCaseNamePart).join(" ");
}

export { PUBLIC_NAME_FALLBACK };
