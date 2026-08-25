const ACCOUNT_EMAIL_EXCEPTION = "carrieseventeen.218@gmail.com";

export function normalizeAccountEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isAllowedAccountEmail(email) {
  const normalizedEmail = normalizeAccountEmail(email);
  return normalizedEmail.endsWith("@tsinglan.org") || normalizedEmail === ACCOUNT_EMAIL_EXCEPTION;
}
