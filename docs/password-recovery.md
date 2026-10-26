# Password recovery

On the login page, **Forgot password?** opens a three-step flow using the existing LitShelf login design:

1. Enter the account's email and request a recovery code.
2. Enter the one-time code from the reset email.
3. Enter and confirm a new password, then continue to LitShelf.

This uses Supabase's `resetPasswordForEmail`, `verifyOtp` with `type: "recovery"`, and `updateUser({ password })`. Recovery uses the existing account and user ID, preserving profiles, shelves, event memberships, contributions, and votes. It never calls signup or automatic user creation. The return destination from the original login request is preserved.

## Required deployment setup

The frontend is prepared locally; pushing and deployment are handled by the site owner. No hosted Auth settings, real passwords, or live emails were changed during development.

**Before enabling the new frontend, update the hosted Supabase reset email template:**

1. In the linked Supabase project, open **Authentication → Email → Templates → Reset password** (the template editor may appear under Email Templates).
2. Use the subject `Reset your LitShelf password / 重设 LitShelf 密码`.
3. Copy the contents of [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) into the template body and save.

The template must contain **`{{ .Token }}`** so the email displays the code. The default link-only recovery email does not work with this code-entry flow. Apply the recovery template only to Reset password.

`supabase/config.toml` references the same template for local Supabase. Editing that file or deploying the frontend does not automatically update a hosted project's email template. This flow needs no new database tables or migration and avoids email callback URLs conflicting with the app's hash router.

Use the project's working email sender/SMTP configuration. Email throttling and code expiry are enforced by Supabase; the UI also prevents duplicate requests and applies a sixty-second resend cooldown. If someone cannot access their school inbox, they should contact the school administrator rather than create a replacement account.

## Matching first-time signup email

For the same cream background, warm brown type, and bilingual copy in the first-time signup email:

1. Open **Authentication → Email → Templates → Confirm sign up** in the hosted Supabase project.
2. Set the subject to `Welcome to LitShelf — verify your email / 欢迎来到 LitShelf · 验证邮箱`.
3. Paste the full contents of [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html) into the body and save.

This is the signup confirmation template, separate from Reset password. Keep `{{ .Token }}` exactly as written: the existing signup screen asks for the emailed code. The local Supabase configuration also references this template. No signup logic changes or frontend deployment are required to apply the email styling in the hosted dashboard; no hosted templates have been changed automatically.

## Verification and failure handling

The response after requesting a code is neutral about whether an account exists. Code verification must return an authenticated session for the requested email. Before changing the password, the app calls Auth again and verifies that the user ID and email still match the verified recovery identity. Expired sessions, account switches, invalid/used codes, rate limits, password mismatch, weak passwords, unchanged passwords, and network failures have specific English and Chinese messages.

Only the pending email is retained in session storage. Codes, new passwords and the verified recovery step are kept in memory. Refreshing returns to code verification; a code already consumed before a refresh must be replaced using Resend code. Successful verification uses the existing auth listener, and successful password recovery retains that authenticated account session; Continue returns to the original destination.

Run `node --test test/authRecovery.test.mjs test/authOtp.test.mjs test/authOtpUiContract.test.mjs test/authEmailPolicy.test.mjs` from `frontend/`. These twenty-seven targeted tests verify recovery-only API calls, account/session matching, password validation, safe storage, errors, localization, and the code template while preserving the existing signup and password-login flow. Production build and changed-file lint also pass. Auth responses are mocked; no live reset emails or passwords are used.

A rendered Login form check with mocked Auth also passed: opening recovery, preventing duplicate requests, rejecting an invalid code, accepting a valid code, showing password mismatch and backend password errors, successfully updating the password, clearing pending recovery state, and returning to the original page.

### Reset-code request connection errors

The browser connects directly to Supabase Auth. Loading LitShelf or other websites successfully does not establish whether that separate Auth endpoint is reachable from the affected device. A browser transport failure can involve DNS, a firewall, browser filtering, or the network route; the error text alone cannot identify which one. Compare the same device on another network and another browser, and match the attempt time with Supabase Auth `/recover` logs. In Chrome's Network panel, inspect the failed `/auth/v1/recover` request's status/error; do not share request bodies, codes, passwords, or authorization headers.

The UI now distinguishes browser transport failures from HTTP server errors, email-delivery failures, and timeouts. A server response mentioning “fetch” is no longer automatically treated as the user's connection failing. No automatic retries send additional reset emails. Applying these message changes requires the owner's normal frontend deployment.

After applying the template and deploying, the owner should check recovery with an account/inbox they control: receive the code, reject an invalid code, set a new password, confirm that the old password fails and the new password works, and confirm that the account still has the same user ID and existing content.

Supabase references: [password reset requests](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and [password updates](https://supabase.com/docs/reference/javascript/auth-updateuser).
