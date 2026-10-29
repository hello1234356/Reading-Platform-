# Club community redesign

The existing `/clubs/:clubId` route now renders `components/clubs/ClubRoom.jsx`.
The directory and creation flow remain in `pages/BookClubs.jsx`. Creation and
in-room settings share the moderated book picker, schedule editor, and core
validation. No privacy/join-approval fields existed in the current creation API,
so the redesign retains membership-gated rooms and the current joining model.

## Deployment

Apply `supabase/migrations/202610290001_club_community.sql` to the database **before**
deploying the frontend. Review against the deployed schema first: the historical
initial schema in this repository predates the current `club_posts`,
`club_schedule`, `book_clubs.title`, `duration`, `members_wanted`, `tags`,
`cover_url`, and `updated_at` contracts already used by the application.
The migration assumes these existing tables/columns, `can_use_moderated_book`,
and `is_admin`. It must not be run against the initial migration in isolation.

The migration creates two channels per existing/new club, assigns existing
`club_posts` to general, and copies any distinct legacy `club_messages` without
deleting its source. All club and existing schedule IDs are preserved. Only
stages explicitly removed in settings are deleted. It adds announcements, member
tag definitions/assignments, indexes, RLS, integrity triggers, and the atomic
`save_club_settings` RPC. Realtime tables are added to `supabase_realtime` if that
publication exists. If it does not, enable that publication in Supabase before
launching live chat. Clients also retry/catch up every 15 seconds.

Settings save uses an edit timestamp to reject stale edits. Chat activity retains
its own activity timestamp and does not invalidate settings drafts. Joins and
capacity changes lock the same club row. Owners cannot leave, change ownership,
or reduce capacity below current membership. Members can choose at most 3 of
up to 20 host-defined identity tags. Descriptive club tags remain separate.

## Verification

- `npm --prefix frontend run build`
- Run ESLint against the changed JS/JSX files using `frontend/eslint.config.js`.
- `node --test frontend/test/clubCommunity.test.mjs frontend/test/i18n.test.mjs frontend/test/book-search-initiator.test.mjs frontend/test/book-moderation.test.mjs`
- `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/club_community.mjs`

The SQL integration test executes the actual migration in isolated PostgreSQL
with a fixture of the existing contracts. It covers legacy conversations, RLS
against broad old policies, atomic rollback, ownership, self tags, book changes,
capacity, schedule ordering/IDs, stale saves, owner leave protection, and deletion.
It never modifies hosted data. PGlite is a temporary test tool, not an app dependency.

After applying the migration, verify two authenticated sessions: host edits and
member refresh, message delivery and channel isolation, spoiler acknowledgement,
member tags, notices, pagination, and mobile drawers/composer. Live database
inspection timed out in this environment and the browser automation host was
unavailable, so hosted-schema validation, visual browser QA, and two-session
realtime verification remain outstanding. The migration has not been applied.

Unread channel badges and threaded conversations are not included. There are no
mock messages or users in the application.

## Club profiles and moderated publishing

Apply `202610290002_club_member_profiles.sql` after the community migration,
then deploy `supabase/functions/club-content` before deploying this frontend.
The new column is `club_members.nickname`; existing memberships and selected
tags stay intact. An empty nickname falls back to the original account username.
The member modal is the only profile/tag editing UI; member rows and chat names
open it. Host roles always use the immutable creator/user IDs.

The existing `frontend/src/lib/moderationApi.js` calls the deployed
`moderation-content` function. Its source is absent from this checkout. Previously,
club posts passed its client-side check, but direct database inserts could bypass
that check. The `club-content` Edge function now authenticates the user, checks
membership, asks that same moderation service for a decision, and invokes a
service-only database write. Both channels use `club_message` policy; ordinary
spoiler discussion receives the existing policy without a safety bypass. Changed
nicknames use this same established content policy. Empty/unchanged nicknames
need no fresh text check. Warnings retain the existing explicit override flow;
block/report/unknown/unavailable decisions never publish.

Deploy the wrapper with the normal Supabase function credentials. It uses the
provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on
the server only. Do not replace or redeploy `moderation-content` from this checkout.
The migration denies direct client inserts/updates to both club message tables,
and denies client nickname writes. Its service-only RPCs recheck membership,
channel association, nickname limits, and tag scope, and update nicknames/tags
atomically. Existing self-tag RLS remains in force.

Typing uses channel-specific Supabase broadcast and presence, with throttled
start events, explicit stop on pause/blur/send, leave cleanup, and a stale timeout.
It reuses `.club-typing-indicator` and `.club-typing-dots` from `BookClubs.css`.
Names come from current membership data; draft text is never broadcast or stored.
A reserved indicator row and history resize observer keep the composer stable.
Short histories align at the bottom using a flex stack; pagination and the
existing near-bottom check still preserve a reader's position in older history.

Verification: `frontend/test/clubContentEndpoint.test.mjs` executes the actual
Edge handler with isolated auth/moderation/database test adapters and verifies
both channels, warning confirmation, rejection/unavailability, verified actor IDs,
and nickname moderation. `frontend/test/clubMemberProfile.test.mjs` checks display
fallbacks and nickname validation. `supabase/tests/club_member_profiles.mjs`
executes both migrations in isolated PostgreSQL and checks direct-write denial,
profile atomicity, tag replacement/scope, preserved global usernames and
memberships, and service-only publishing. These tests do not call the deployed
moderation provider. Two authenticated browser sessions, live provider behavior,
animated typing, and viewport/scroll behavior still require live verification.
Neither new migration nor Edge deployment has been applied by this task.
