# One-time desktop notification invitation

This update changes onboarding only. The deployed VAPID keys, service worker, subscription RPCs/table, Edge delivery function, Cron job, inbox events, and manual browser preferences are reused.

## Deployment

1. Review and apply **`supabase/migrations/202610300002_desktop_push_onboarding.sql`** using the existing migration process. Check the linked project and pending migrations before running `supabase db push`.
2. Build and deploy the frontend (`cd frontend && npm run build`). Keep the existing public VAPID environment value.

No Edge Function deployment, Cron changes, key rotation, or subscription migration is needed. No production changes were made during implementation. Deploy the migration first; missing or unreachable RPCs suppress automatic onboarding safely while manual inbox settings remain available.

## Once per account

`desktop_push_onboarding.user_id` is the primary key. An authenticated, ownership-checked RPC atomically inserts the invitation record before opening the modal. Only the winning browser/tab can show it. Other browsers, refreshes, logout/login, or later visits receive `false`. The table has RLS, exposes only the current user's record, and denies direct client writes/deletes. Existing active subscriptions in any browser also suppress the automatic invitation.

The initial record is deliberately enough to prevent repetition. Dismissal, X, Escape, successful enable, and native denial update optional outcome metadata. If that completion request fails offline, the initial record still prevents any automatic reopening. Refreshing or leaving while the first invitation is open consumes that opportunity too. A failed subscription attempt remains in the open modal with a short error and an Enable retry; exiting that modal never schedules it again.

Every account has independent state, including existing accounts. No account creation-date filter is used. The old browser-local invitation marker is no longer used to decide whether to show onboarding, and the inbox no longer has an independent invitation trigger. Do not delete/reset onboarding records during routine deployments or when users disable notifications.

The UI waits for authentication, per-account browser preference reconciliation, a loaded/visible page, and an animation frame before claiming. It avoids the login route and existing open dialogs. Enabled, denied, unsupported, unconfigured, loading, or failed browser states are excluded. A cancelled React StrictMode setup cannot consume the invitation before its scheduled frame. Late responses after logout/account changes cannot show an old account's modal.

The centered native `<dialog>` supplies focus containment, Escape handling, and focus restoration. The actual navigation wordmark `/branding/litshelf-logo9.svg` is reused without cropping. English and Chinese catalogs contain the new copy. The modal is 472px wide (viewport minus 32px maximum), with the requested colors, 20px corners, 28px padding, burgundy buttons, a subtle backdrop, and reduced-motion-aware entrance animation. Browser permission is requested only by the existing Enable handler, directly in the click stack.

Manual control remains at **Inbox → Desktop notifications**. An invitation dismissal never disables an existing subscription or changes inbox read/count behavior.

## Verification

Executed locally:

- Focused frontend lint and production build.
- Eligibility/scheduling tests covering existing/new accounts, login and excluded permission states, loaded/visible page gating, other dialogs, StrictMode replay, stale account responses, and offline failure.
- Existing enable-flow tests with mocked browser/network dependencies: permission is requested synchronously only on Enable; registration must succeed before reporting success; denial/dismissal do not subscribe; permission/registration errors allow retry.
- Existing push, inbox/read-behavior, and translation regression tests.
- The real additive SQL migration against an isolated PostgreSQL/PGlite fixture: concurrent claims, independent accounts, all response outcomes, login persistence, RLS reads, denied cross-account writes, no client reset/delete, offline completion, and existing subscriptions on another browser.

Commands:

```sh
cd frontend
node --test test/pushOnboarding.test.mjs test/desktopPush.test.mjs test/notificationBehavior.test.mjs test/notifications.test.mjs test/i18n.test.mjs
npm run build
```

From the repository root, with PGlite installed in a temporary test directory as described in `desktop-push.md`:

```sh
PGLITE_MODULE=/tmp/litshelf-push-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/push-onboarding.mjs
```

The already-working Safari/Chrome delivery was reported by the user and was not redeployed or retested against production for this UI change. Still verify the new modal visually in those browsers, native focus/permission behavior, and cross-device dismissal against the deployed migration. Browser automation was unavailable in this session; mocked tests do not establish real-browser visual or permission behavior.
