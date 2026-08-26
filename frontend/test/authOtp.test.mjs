import assert from "node:assert/strict";
import test from "node:test";
import {
  OTP_RESEND_TYPE,
  OTP_VERIFY_TYPE,
  PENDING_SIGNUP_EMAIL_KEY,
  clearPendingSignupEmail,
  friendlyAuthError,
  passwordLogin,
  readPendingSignupEmail,
  requestSignupOtp,
  resendSignupOtp,
  savePendingSignupEmail,
  verifySignupOtp,
} from "../src/lib/authOtp.js";

function authMock(overrides = {}) {
  return {
    signUp: async () => ({ data: { user: { id: "new-user" }, session: null }, error: null }),
    verifyOtp: async () => ({ data: { user: { id: "new-user" }, session: { user: { id: "new-user" } } }, error: null }),
    resend: async () => ({ data: {}, error: null }),
    signInWithPassword: async () => ({ data: { user: { email_confirmed_at: "now" } }, error: null }),
    ...overrides,
  };
}

test("school signup normalizes email and sends a password signup request without a redirect link", async () => {
  let credentials;
  const auth = authMock({ signUp: async (value) => {
    credentials = value;
    return { data: { user: {} }, error: null };
  } });
  const result = await requestSignupOtp(auth, { email: " Reader@Tsinglan.org ", password: "secret1" });
  assert.deepEqual(credentials, { email: "reader@tsinglan.org", password: "secret1" });
  assert.equal(result.email, "reader@tsinglan.org");
  assert.equal("options" in credentials, false);
});

test("non-school signup is rejected before Supabase is called", async () => {
  let calls = 0;
  const auth = authMock({ signUp: async () => { calls += 1; return { data: {}, error: null }; } });
  await assert.rejects(requestSignupOtp(auth, { email: "reader@example.com", password: "secret1" }), /@tsinglan\.org/);
  assert.equal(calls, 0);
});

test("the existing maintainer exception remains valid for signup", async () => {
  let sentEmail;
  const auth = authMock({ signUp: async ({ email }) => { sentEmail = email; return { data: {}, error: null }; } });
  await requestSignupOtp(auth, { email: "carrieseventeen.218@gmail.com", password: "secret1" });
  assert.equal(sentEmail, "carrieseventeen.218@gmail.com");
});

test("signup OTP verification uses the supported email type and trimmed token", async () => {
  let params;
  const auth = authMock({ verifyOtp: async (value) => {
    params = value;
    return { data: { session: { access_token: "not-inspected" } }, error: null };
  } });
  const data = await verifySignupOtp(auth, { email: " Reader@Tsinglan.org ", token: " 123456 " });
  assert.equal(OTP_VERIFY_TYPE, "email");
  assert.deepEqual(params, { email: "reader@tsinglan.org", token: "123456", type: "email" });
  assert.ok(data.session);
});

test("resend uses Supabase's signup resend operation", async () => {
  let params;
  const auth = authMock({ resend: async (value) => { params = value; return { data: {}, error: null }; } });
  await resendSignupOtp(auth, " Reader@Tsinglan.org ");
  assert.equal(OTP_RESEND_TYPE, "signup");
  assert.deepEqual(params, { type: "signup", email: "reader@tsinglan.org" });
});

test("password login remains signInWithPassword", async () => {
  let params;
  const auth = authMock({ signInWithPassword: async (value) => { params = value; return { data: { user: {} }, error: null }; } });
  await passwordLogin(auth, { email: "reader@tsinglan.org", password: "secret1" });
  assert.deepEqual(params, { email: "reader@tsinglan.org", password: "secret1" });
});

test("pending verification persistence stores only the normalized email and survives refresh", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  savePendingSignupEmail(storage, " Reader@Tsinglan.org ");
  assert.deepEqual([...values.entries()], [[PENDING_SIGNUP_EMAIL_KEY, "reader@tsinglan.org"]]);
  assert.equal(readPendingSignupEmail(storage), "reader@tsinglan.org");
  assert.equal(JSON.stringify([...values.entries()]).includes("secret1"), false);
  clearPendingSignupEmail(storage);
  assert.equal(readPendingSignupEmail(storage), "");
});

test("invalid, expired, rate-limited, network, and existing-user errors have safe copy", () => {
  assert.match(friendlyAuthError(new Error("Token has expired"), "verify"), /invalid or has expired/);
  assert.match(friendlyAuthError(new Error("Invalid token"), "verify"), /invalid or has expired/);
  assert.match(friendlyAuthError({ message: "rate limit", status: 429 }, "resend"), /Too many verification emails/);
  assert.match(friendlyAuthError(new Error("User already registered"), "signup"), /already exists/);
  assert.match(friendlyAuthError(new Error("Email already confirmed"), "resend"), /already verified/);
  assert.match(friendlyAuthError(new Error("Failed to fetch"), "signup"), /couldn't reach/);
});
