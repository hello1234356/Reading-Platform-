const ACCOUNT_EMAIL_EXCEPTION = "carrieseventeen.218@gmail.com";
const ACCOUNT_EMAIL_DOMAIN = "@tsinglan.org";

export function normalizeAccountEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isAllowedAccountEmail(email) {
  const normalizedEmail = normalizeAccountEmail(email);
  return normalizedEmail.endsWith(ACCOUNT_EMAIL_DOMAIN) || normalizedEmail === ACCOUNT_EMAIL_EXCEPTION;
}

export function isAllowedLoginEmail(email) {
  return isAllowedAccountEmail(email);
}
