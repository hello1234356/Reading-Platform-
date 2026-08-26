import { isAllowedAccountEmail, isAllowedLoginEmail, normalizeAccountEmail } from "./authEmailPolicy.js";

export const PENDING_SIGNUP_EMAIL_KEY = "litshelf-pending-signup-email";
export const OTP_VERIFY_TYPE = "email";
export const OTP_RESEND_TYPE = "signup";

function errorText(error) {
  return String(error?.message || "").toLowerCase();
}

export function friendlyAuthError(error, context) {
  const message = errorText(error);
  if (message.includes("rate") || message.includes("too many") || error?.status === 429) {
    return "Too many verification emails were requested. Please wait a little and try again.";
  }
  if (context === "verify" && (message.includes("expired") || message.includes("invalid") || message.includes("token"))) {
    return "That verification code is invalid or has expired. Please request a new one.";
  }
  if (context === "signup" && (message.includes("already") || message.includes("registered") || message.includes("exists"))) {
    return "An account already exists for this email. Try logging in instead.";
  }
  if (context === "resend" && (message.includes("already") || message.includes("confirmed") || message.includes("verified"))) {
    return "This email is already verified. Try logging in instead.";
  }
  if (message.includes("fetch") || message.includes("network") || message.includes("failed to connect")) {
    return "We couldn't reach LitShelf authentication. Please try again.";
  }
  if (message.includes("supabase url") || message.includes("anon key") || message.includes(".env")) {
    return "LitShelf authentication is not configured. Please contact an administrator.";
  }
  if (context === "login") return "Login failed. Check your email and password.";
  if (context === "verify") return "That verification code is invalid or has expired. Please request a new one.";
  return "We couldn't complete that authentication request. Please try again.";
}

export async function requestSignupOtp(auth, { email, password }) {
  const normalizedEmail = normalizeAccountEmail(email);
  if (!isAllowedAccountEmail(normalizedEmail)) {
    throw Object.assign(new Error("Please use your @tsinglan.org school email."), { code: "invalid_domain" });
  }
  const { data, error } = await auth.signUp({ email: normalizedEmail, password });
  if (error) throw error;
  return { data, email: normalizedEmail };
}

export async function verifySignupOtp(auth, { email, token }) {
  const { data, error } = await auth.verifyOtp({
    email: normalizeAccountEmail(email),
    token: String(token || "").trim(),
    type: OTP_VERIFY_TYPE,
  });
  if (error) throw error;
  return data;
}

export async function resendSignupOtp(auth, email) {
  const { data, error } = await auth.resend({ type: OTP_RESEND_TYPE, email: normalizeAccountEmail(email) });
  if (error) throw error;
  return data;
}

export async function passwordLogin(auth, { email, password }) {
  const normalizedEmail = normalizeAccountEmail(email);
  if (!isAllowedLoginEmail(normalizedEmail)) {
    throw Object.assign(new Error("Please use your Tsinglan school email."), { code: "invalid_domain" });
  }
  const { data, error } = await auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) throw error;
  return data;
}

export function readPendingSignupEmail(storage) {
  const email = normalizeAccountEmail(storage?.getItem(PENDING_SIGNUP_EMAIL_KEY));
  return isAllowedAccountEmail(email) ? email : "";
}

export function savePendingSignupEmail(storage, email) {
  storage?.setItem(PENDING_SIGNUP_EMAIL_KEY, normalizeAccountEmail(email));
}

export function clearPendingSignupEmail(storage) {
  storage?.removeItem(PENDING_SIGNUP_EMAIL_KEY);
}
