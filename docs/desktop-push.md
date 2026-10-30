# Desktop browser push notifications

The desktop push system is deployed and was reported working in Safari and Chrome. The invitation now uses the account-level onboarding described in [One-time desktop invitation](desktop-push-onboarding.md). That focused update needs only its additive migration and frontend deployment; the remaining setup instructions below describe the original push infrastructure. Manual preferences remain at the bottom of the inbox under **Desktop notifications**.

## Deployment

1. Review and apply `supabase/migrations/202610300001_desktop_push.sql` to staging first. Use the normal migration workflow (`supabase db push` only after checking the linked project and pending migrations). The migration adds subscription, presence, queue, and installation tables, narrow authenticated RPCs, and an INSERT trigger on the existing inbox table. It does not change chat, moderation, existing inbox counts, or read acknowledgements. It does not send historical notifications.
2. Generate one persistent VAPID pair in a secure shell using `npx web-push@3.6.7 generate-vapid-keys`. Keep the private key in your secret manager. Do not commit it, put it in `VITE_*`, or include it in frontend output. Use a valid `mailto:` contact or public HTTPS URL for the VAPID subject (not a localhost URL).
3. Generate a separate random dispatch secret, for example with `openssl rand -hex 32`. Set these **Edge Function secrets** through the Supabase dashboard or a git-ignored secrets file passed to `supabase secrets set --env-file <file>`:

   ```dotenv
   VAPID_PUBLIC_KEY=<public VAPID key>
   VAPID_PRIVATE_KEY=<private VAPID key>
   VAPID_SUBJECT=mailto:<your-maintainer-email>
   DESKTOP_PUSH_DISPATCH_SECRET=<random dispatch secret>
   ```

   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. The latter stays server-side. The Edge function accepts only the dispatch secret, not user JWTs or the anon key.
4. Deploy `supabase functions deploy desktop-push --no-verify-jwt`. `supabase/config.toml` also sets `verify_jwt = false` for this function because its handler authenticates the dedicated scheduler secret. The function uses pinned `npm:web-push@3.6.7` for standard encryption and VAPID; no frontend library was added.
5. Add `VITE_WEB_PUSH_PUBLIC_KEY=<same public key>` to the frontend deployment environment and rebuild/deploy the frontend. Serve the site over HTTPS. The public worker must be available as JavaScript at `/desktop-push/sw.js`; do not rewrite that path to the SPA HTML. Serve the existing `/branding/apple-touch-icon.png` publicly. No manifest, installation prompt, or PWA UI is needed. The dedicated `/desktop-push/` worker scope has no fetch handlers and never replaces or claims an existing root worker. Avoid long immutable caching for the worker script; `Cache-Control: no-cache` is appropriate.
6. Configure a recurring server-side dispatcher as below. Browser tabs are not responsible for sending pushes. Without this scheduler, subscriptions can be saved but messages will not be delivered.

## Scheduler (Supabase Cron, pg_net, and Vault)

Enable `pg_cron`, `pg_net`, and Vault in the Supabase dashboard. In Vault, create two secrets:

- `desktop_push_dispatch_url`: `https://<project-ref>.supabase.co/functions/v1/desktop-push`
- `desktop_push_dispatch_secret`: the **same** random dispatch secret from step 3.

After checking the correct project, run this once in the SQL editor:

```sql
select cron.schedule(
  'litshelf-desktop-push',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'desktop_push_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'desktop_push_dispatch_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$
);
```

This gives roughly one-minute dispatch latency. Each run claims at most 20 deliveries with five concurrent provider requests and 10-second timeouts. Inspect the returned aggregate counts and cron/pg_net status when operating the queue. Queue backlog can add latency; monitor it before increasing frequency. Never expose Vault values or log endpoint URLs, subscription keys, tokens, or inbox contents.

Pause delivery using `select cron.unschedule('litshelf-desktop-push');`. Remove the public frontend VAPID environment value to stop inviting new subscriptions. Existing inbox functionality is independent of the scheduler. Rotating VAPID keys requires disabling and re-enabling subscriptions in each browser; do not rotate these keys on every deployment.

## Behavior and security

- The server queues **new personal inbox INSERTs** for current subscribers. Existing club mention triggers remain unchanged; ordinary messages and group notices do not create inbox or push events. Defensive filters also exclude those event types at dispatch. Personal notifications and newly active public inbox announcements are supported, including future-scheduled announcements. Old notifications and public announcements are not replayed when someone opts in.
- Read items and self-actions are excluded. Fresh, focused-page presence suppresses relevant-route or open-inbox alerts **before delivery**. Existing club read acknowledgements also suppress alerts for messages already read. Presence is advisory with a 60-second TTL, so a recently closed/crashed tab can briefly suppress an alert; the inbox always retains its own authoritative state.
- Presence suppression is server-side because Safari requires a user-visible notification for ordinary Web Push deliveries. The worker does not silently consume otherwise valid alerts just because a tab is open. Duplicate, expired, and wrong-account payloads are discarded for correctness/privacy.
- Subscriptions are tied to an authenticated user and Supabase session. Table access is denied to frontend roles; narrow RPCs derive the caller and session, enforce a ten-browser account cap, and never accept a client-supplied recipient for delivery. Endpoint registration is restricted to HTTPS Chrome/FCM, Edge/WNS, Safari/APNs, and Firefox/Mozilla push hosts. Provider requests forbid redirects. Session deletion removes subscriptions and queued jobs by foreign-key cascade; dispatch also checks session expiry. Local worker account state is cleared on sign-out/account changes.
- Subscription endpoints and encryption keys are stored in protected Supabase tables; they are never public profile data. Expired/revoked endpoints returning 404/410 are removed. Permission changes are reconciled on page visibility/focus and future visits. Silent subscription renewal is not attempted from a logged-out service worker; a missing subscription can be enabled again in preferences.
- Queue uniqueness and leases prevent concurrent repeat dispatch. Transient failures retry with bounded backoff, at most five attempts within one day. Push TTL is five minutes. The worker keeps event IDs in IndexedDB for seven days and uses stable tags with `renotify: false`. Network delivery is inherently at-least-once; a provider acceptance followed by a process crash may cause a retry, which the worker deduplicates. Reserving an event before display favors avoiding duplicates; a browser crash in that narrow interval can lose a desktop alert, but never its inbox item.
- OS text contains a short event label and, when relevant, the actor's display name. It never copies message bodies, review contents, book titles, authored announcement text, or spoiler excerpts. Unknown event types use a generic inbox notification.
- Notification clicks open existing internal club/message, post/comment/reply, book, or event links via the existing hash router. External or missing destinations open the inbox instead. Account changes invalidate previously displayed notifications' destinations. Clicking a system notification does not itself alter read state.
- Opt-in is desktop capability-gated; mobile/iPad are excluded. Narrow desktop windows still have access to preferences and a clamped popover. Chrome, Edge, and Safari/macOS OS/browser settings may prevent notifications while the browser is quit; this cannot be guaranteed by application code. No legacy Safari certificate integration is used.

## Tests run and remaining verification

Automated local verification:

- `cd frontend && node --test test/desktopPush.test.mjs test/notificationBehavior.test.mjs test/notifications.test.mjs test/i18n.test.mjs`
- Frontend production build and focused lint on new/changed push components.
- The actual SQL migration runs against an isolated PostgreSQL/PGlite fixture. It checks authenticated registration, cross-account rejection, table privacy, invalid endpoints, mention/self/read/history filtering, queue leases/retries, presence TTL, public announcements, and session cascade cleanup.
- The actual Edge handler runs with a mocked Supabase client and provider transport and real `web-push` encryption/VAPID signing. It checks worker authorization, private-content exclusion, successful delivery acknowledgement, presence suppression, expired endpoints, retries, and terminal failures.
- Service-worker event tests cover duplicate arrivals, logout/account mismatch, stale messages, failed-display retry, and safe click routing. They use a deterministic transactional storage mock, not a real browser IndexedDB implementation.

To rerun the isolated SQL and delivery tests without adding app dependencies:

```sh
npm install --prefix /tmp/litshelf-push-tests --no-package-lock --ignore-scripts @electric-sql/pglite@0.5.13 web-push@3.6.7
PGLITE_MODULE=/tmp/litshelf-push-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/desktop-push.mjs
WEB_PUSH_MODULE=/tmp/litshelf-push-tests/node_modules/web-push/src/index.js node supabase/tests/desktop-push-delivery.mjs
```

Use Node 24 for the delivery harness's built-in TypeScript stripping. These are local tests; they do not contact production or send real notifications.

Still required in staging: deployed Supabase/Postgres and Edge-runtime smoke tests; actual subscriptions and delivery on Chrome, Edge, and Safari/macOS; real browser IndexedDB/service-worker restart behavior; OS permissions/revocation; background/no-tab delivery; and visual checks at 1024, 1280, and 1440px plus a narrow desktop window. Verify the popover anchor, focus/Escape, and both dismissal buttons, then test an actual club mention and each relevant existing inbox event. Confirm ordinary club messages/notices create nothing. Test opt-out, logout, account switching, key rotation, and a push click with no existing tab. Browser automation access was unavailable during implementation, so native delivery and visual fidelity are not claimed as tested.

References: [WebKit Web Push requirements](https://webkit.org/blog/12945/meet-web-push/), [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [web-push VAPID/encryption API](https://github.com/web-push-libs/web-push).
