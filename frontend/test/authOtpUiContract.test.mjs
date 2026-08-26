import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginSource = await readFile(new URL("../src/pages/Login.jsx", import.meta.url), "utf8");
const otpSource = await readFile(new URL("../src/lib/authOtp.js", import.meta.url), "utf8");
const authHookSource = await readFile(new URL("../src/hooks/useAuth.js", import.meta.url), "utf8");

test("signup UI transitions to a refresh-safe OTP state without persisting secrets", () => {
  assert.match(loginSource, /setMode\("verify"\)/);
  assert.match(loginSource, /readPendingSignupEmail\(window\.sessionStorage\)/);
  assert.match(loginSource, /autoComplete="one-time-code"/);
  assert.match(loginSource, /inputMode="numeric"/);
  assert.doesNotMatch(otpSource, /setItem\([^\n]*(password|token|code)/i);
});

test("OTP UI has resend double-click protection and a change-email path", () => {
  assert.match(loginSource, /if \(resending \|\| resendCoolingDown\) return/);
  assert.match(loginSource, /disabled=\{resending \|\| resendCoolingDown\}/);
  assert.match(loginSource, /goTo\("signup"\)/);
});

test("signup no longer configures a confirmation link", () => {
  assert.doesNotMatch(loginSource + otpSource, /emailRedirectTo|ConfirmationURL|token_hash/);
});

test("verification secrets are neither logged nor placed in a URL", () => {
  assert.doesNotMatch(loginSource + otpSource, /console\.(?:log|debug|info|warn|error)/);
  assert.doesNotMatch(loginSource + otpSource, /URLSearchParams|location\.(?:search|hash)|navigate\([^)]*(?:token|code)/);
});

test("successful verification relies on the existing auth listener without profile bootstrap duplication", () => {
  assert.match(authHookSource, /onAuthStateChange/);
  assert.match(loginSource, /await verifySignupOtp/);
  assert.equal((loginSource.match(/navigate\("\/"\)/g) || []).length, 2);
  assert.doesNotMatch(loginSource, /from\(["']profiles["']\)|createProfile|upsert/);
});
