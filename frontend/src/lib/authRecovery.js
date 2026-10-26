import { isAllowedLoginEmail, normalizeAccountEmail } from "./authEmailPolicy.js";

export const PENDING_RECOVERY_EMAIL_KEY = "litshelf-pending-recovery-email";

function recoveryError(code) { return Object.assign(new Error(code), { code }); }
function recoveryEmail(email) {
  const normalized=normalizeAccountEmail(email);
  if (!isAllowedLoginEmail(normalized)) throw recoveryError("invalid_domain");
  return normalized;
}

export async function requestPasswordRecovery(auth,email) {
  const normalized=recoveryEmail(email);
  // Recovery only: never use signup or signInWithOtp, which can create users.
  const {error}=await auth.resetPasswordForEmail(normalized);
  if (error && !["user_not_found","email_not_found"].includes(error.code)) throw error;
  return normalized;
}

export async function verifyPasswordRecovery(auth,{email,token}) {
  const normalized=recoveryEmail(email);
  const code=String(token || "").trim();
  if (!code) throw recoveryError("recovery_code_invalid");
  const {data,error}=await auth.verifyOtp({email:normalized,token:code,type:"recovery"});
  if (error) throw error;
  const user=data?.user;
  if (!data?.session || !user?.id || data.session.user?.id!==user.id || normalizeAccountEmail(user.email)!==normalized) {
    throw recoveryError("recovery_session_invalid");
  }
  return user.id;
}

export async function updateRecoveredPassword(auth,{email,verifiedUserId,password,confirmation}) {
  const normalized=recoveryEmail(email);
  if (typeof password!=="string" || password.length<6) throw recoveryError("password_too_short");
  if (password!==confirmation) throw recoveryError("password_mismatch");
  if (!verifiedUserId) throw recoveryError("recovery_session_invalid");
  // Recheck with Auth: a tab/account switch must not change another account.
  const {data,error}=await auth.getUser();
  if (error) throw error;
  if (data?.user?.id!==verifiedUserId || normalizeAccountEmail(data?.user?.email)!==normalized) {
    throw recoveryError("recovery_session_invalid");
  }
  const result=await auth.updateUser({password});
  if (result.error) throw result.error;
  return result.data;
}

export function recoveryErrorKey(error,step) {
  const message=String(error?.message || "").toLowerCase();
  if (error?.code==="invalid_domain") return "auth.resetSchoolEmail";
  if (error?.code==="password_too_short") return "auth.passwordLength";
  if (error?.code==="password_mismatch") return "auth.passwordMismatch";
  if (error?.code==="same_password") return "auth.passwordUnchanged";
  if (error?.code==="weak_password") return "auth.passwordStronger";
  if (error?.status===429 || ["over_request_rate_limit","over_email_send_rate_limit"].includes(error?.code) || /rate limit|too many/.test(message)) return "auth.resetRateLimited";
  if (/supabase url|anon key|\.env/.test(message)) return "auth.resetUnavailable";
  if (error?.code==="email_address_not_authorized" || /error sending.*email|smtp|mail.*delivery/.test(message)) return "auth.resetEmailServiceError";
  if (error?.code==="request_timeout" || error?.status===504) return "auth.resetTimeout";
  // An HTTP response means the service was reached. Classify server failures
  // before browser transport errors, even if the server mentions "fetch".
  if (error?.status>=500 || error?.code==="unexpected_failure") return "auth.resetServiceError";
  if ((error?.name==="AuthRetryableFetchError" && error?.status===0) || /^(failed to fetch|fetch failed|networkerror|load failed)|network request failed|failed to connect/i.test(message)) return "auth.resetNetworkError";
  if (error?.code==="recovery_session_invalid" || /session|jwt|reauthenticat/.test(message)) return "auth.resetSessionExpired";
  if (step==="verify") return "auth.resetCodeInvalid";
  return step==="password" ? "auth.resetUpdateError" : "auth.resetRequestError";
}

export function readPendingRecoveryEmail(storage) {
  const email=normalizeAccountEmail(storage?.getItem(PENDING_RECOVERY_EMAIL_KEY));
  return isAllowedLoginEmail(email) ? email : "";
}
export function savePendingRecoveryEmail(storage,email) { storage?.setItem(PENDING_RECOVERY_EMAIL_KEY,recoveryEmail(email)); }
export function clearPendingRecoveryEmail(storage) { storage?.removeItem(PENDING_RECOVERY_EMAIL_KEY); }
