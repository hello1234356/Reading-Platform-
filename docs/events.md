# LitShelf Events

Events routes (admin-only until an owner publishes): `/#/events`, `/events/library-book-display`, `/events/wallflower-reading-circle`, and `/events/gen-z-reading-festival` (all use the existing hash router).

## Visibility and publishing

Events starts **off / admins only**. Admins and owners can preview all Events pages and see the navigation link. Other users are redirected home when opening an Events URL, and their navigation has no Events link. The page stays hidden if its access check fails.

An owner can use the **Publish Events** switch at the top of any Events page to make the area and its navigation public, or hide them again. Other admins see the disabled switch and an owner-only explanation. The setting is stored in Supabase, not in browser storage. Open sessions refresh visibility every 30 seconds and when the window receives focus. Existing signed photo URLs may remain valid until their five-minute expiry.

Apply `supabase/migrations/202609230002_events_publication.sql` after the submissions migration. It creates the default-off setting and RPCs, enforces owner-only updates, and adds restrictive access policies to submissions and display photos while Events is hidden. This migration has not been applied to the hosted database here. No owner account changes are needed.

Before release, check signed-out, student, admin and owner sessions: only the owner can publish/hide; direct URLs and the navigation reflect the setting; students cannot bypass hidden mode via the submissions/storage APIs. Test these against a migrated test database.

## Deployment

Apply `supabase/migrations/202609230001_library_display_submissions.sql` through the normal Supabase migration process before deploying the frontend. It creates the submissions table, snapshot trigger, grants/RLS, and private `library-display-photos` bucket. No new environment variables or services are required. This migration has not been applied to the hosted project by this change.

The library form uses the existing authenticated profile and catalog search. A book must already be in the LitShelf catalog; students can use Discover to add missing books through its existing workflow. One recommendation per account is accepted for this initial display. Returning students see their saved receipt. Photo formats are JPG/PNG/WebP, up to 5 MB. Quote and reason limits are 1000 and 800 characters. Students cannot change the review status or read other submissions. Identity and book text are captured by the server, not trusted from the browser.

Admins open **Admin → Library display** (`/#/admin?tab=events`) to read submissions, open original photos, and mark/reopen reviews. Lists paginate in groups of 20; Refresh picks up new submissions. Photo links expire after five minutes; click Open original photo again to renew. Submitted content is not published on the public Events page. Photos can be saved from the original-image link for producing the physical display. Failed uploads/inserts attempt cleanup; periodically remove unreferenced bucket objects after confirming they are not active uploads. Account deletion cascades submission rows, but storage objects require separate cleanup according to the school's retention process.

## Editorial updates

Edit `frontend/src/data/events.js`. Each event has a stable slug, status, bilingual title/name/summary, and optional date/blocks. All UI strings are in `frontend/src/i18n/events.js` and use the existing i18next catalogs.

For the festival, add the confirmed ISO date (`YYYY-MM-DD`) and article blocks. Each block can contain `heading` and `text` objects with `en` and `zh-CN`, or an `image` path with bilingual `alt` and optional `caption`. Store approved public event photos in `frontend/public/events/`. Text renders safely as plain text with paragraph breaks; no HTML is needed. The pending-article notice disappears once blocks exist. No date, recap, or photos have been fabricated.

For the Reading Circle, extend the existing blocks with confirmed details. Set `circleId` only after its actual Circle exists; until then, the link goes to the existing Circles area. The book link uses Discover's existing search route.

## Release smoke checks

- At desktop and phone widths, inspect both languages, navigation, status text and all three detail routes.
- Signed out: open the library form, sign in, verify return to the activity.
- Submit as a test student after applying the migration: select a catalog book, validate rejected file types/size, preview a photo, add quote/reason, submit and refresh the receipt.
- Confirm a second student cannot select the first student's row or sign/read its photo; anonymous requests cannot access either.
- Confirm students cannot update status or replace/delete submitted photos; existing admins can review and open them.
- Test upload/insert failures, retry, and simultaneous submission in two tabs (only one row should persist).

Production build, targeted lint, and nine Events/localization/login tests pass locally. The full suite has ten unrelated failures reproduced against the original HEAD in a separate temporary checkout. Browser inspection and live database/RLS checks still need completion in an available test environment; no production submissions were created during development.
