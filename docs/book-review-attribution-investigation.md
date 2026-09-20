# Book AI review attribution investigation — 2026-09-20

## Verified production findings (read-only)

The reported UUID `68f94ada-7373-4a81-a51a-abd1fba659f6` resolves to the existing
profile **@Zhi**. The auth account is not anonymous and has no entry granting it
an admin/owner role. It is an ordinary user account, not a service-role identity.
This identifies the authenticated account, not the person operating its session.

The database contains **435 external_materialized events across 10 distinct
initiators**. Of those, **85** belong to this account (83 approved assessments,
2 technical errors). All **50** origin events dated September 20 and the **20
most recently updated assessments** have this account's UUID. Other accounts
have 79, 75, 54, 41, 36, 22, 20, 17, and 6 origin events respectively.
These are book-origin counts, not counts of searches.

Consequently, the premise that every database audit has the same initiator is
not supported. The queue orders newest assessments first, and one search can
produce many assessments. That explains the repeated UUID among recent rows.
It does not establish what somebody typed or whether any search was abusive.
No titles, raw queries, email addresses, or other users' identities were needed
for this conclusion.

The deployed moderate-books/index.ts was downloaded into a temporary directory
and compared byte-for-byte with the repository version: they match. The live
origin reader and writer also match the migration. The deployed writer receives
the UUID from `auth.getUser(request bearer token)`; it does not substitute an
admin, service account, reviewer, or submission owner. No hardcoded copy of the
reported UUID exists in application code. The live event SELECT policy is
restricted to authenticated users satisfying `is_admin()`.

## Complete request path

1. `Discover.jsx::runBookSearch` checks the signed-in user and calls
   `bookSearch.js::searchBooksByQueryLanguage`. The club-creation book picker in
   `BookClubs.jsx` uses the same search API.
2. Provider routing queries the catalog and Google Books/Open Library, using the
   existing provider/search-result caches. Results are ranked and returned with
   a `startModeration` callback. No book selection is required.
3. Both pages call `startModeration` automatically for the returned results.
   `bookModerationApi.js::moderateBookSearchResults` first asks for cached
   assessments, then sends unknown identities in batches to `moderate-books`.
4. `supabase/functions/moderate-books/index.ts` validates the bearer token using
   Supabase Auth `getUser`. Its separate service-role database client is only
   an execution credential; `authData.user.id` remains the initiator.
5. The Edge function reuses trusted provider evidence or independently verifies
   the exact provider record. On first evidence caching it calls
   `cache_book_evidence_for_review`, passing the validated user ID internally.
6. That RPC atomically inserts the provider cache, a pending assessment, and an
   `external_materialized` audit event with `initiated_by_user_id`. It excludes
   pre-existing cache identities, catalog rows, and assessments from any policy.
   A unique cache key elects the first concurrent insertion winner. Refreshing
   expired evidence cannot claim a new origin.
7. AI classification/enrichment runs and `saveAssessment` updates the assessment
   and appends decision events. These do not change the immutable origin event.
8. Only later, saving an approved book through `libraryApi.js` or `bookClubApi.js`
   calls `materialize_approved_book` to create the catalog row. This is separate
   from search attribution. Manual submissions and reviewer identities are also
   separate and unchanged.
9. `Admin.jsx::BookReviewOrigin` fetches origin only when its details section is
   opened. The new admin-only profile projection resolves the stored UUID to
   its current username, displayed through the existing `ProfileLink` component.

## Identity gap found and fixed prospectively

There is no evidence that the deployed backend lost the original identity for
the reported rows. There was a frontend timing gap: Supabase chose the current
session when each delayed batch invoked the function. An account change between
provider lookup, cache lookup, and later AI batches could change attribution.
This is a reproducible risk, **not a proven explanation for the historical rows**.

`createSearchModerationInvoker` now captures the initiating session's bearer
credential before provider work and explicitly preserves it for all batches.
The Edge function still validates that signed credential and derives the UUID;
there is no client-supplied initiator UUID. Expired/rejected tokens fail rather
than silently switching actors. Direct moderation retries capture the session
at the start of that request; an existing persisted origin always wins.

The club picker no longer caches entire search responses containing a
session-bound callback. Its underlying provider/result caches remain in place.
No new search log, query-to-user association, or public attribution is introduced.

## Admin UI and migration

`202609200001_book_review_origin_profile.sql` adds only a read-only, admin-checked
RPC. It joins the existing origin event to `profiles.id`, returning the current
username. It preserves the older RPC for compatibility, uses an empty
search_path, denies anonymous execution, and checks `is_admin()` before reading.

The collapsed origin audit now displays **Searched by @username**, using the
existing clickable profile control. Missing/deleted profiles show an unavailable
account; unknown historical origins stay Unknown. UUIDs are not rendered as the
primary visible identity. The explanatory text distinguishes automatic result
assessment from deliberately selecting or submitting a book.

Files changed:
- frontend/src/lib/bookModerationApi.js
- frontend/src/lib/bookSearch.js
- frontend/src/pages/BookClubs.jsx
- frontend/src/pages/Admin.jsx
- supabase/migrations/202609200001_book_review_origin_profile.sql
- frontend/test/book-search-initiator.test.mjs
- frontend/test/book-review-origin-db.test.mjs
- docs/book-review-attribution-investigation.md

## Historical data and validation

No historical attribution was rewritten. The inspected database and source do
not establish incorrect attribution. The existing shared search cache does not
retain the original search actor; timestamps, later searches, review actors,
notifications, or submission owners cannot reliably reconstruct that actor.
External historical request logs were not inspected, so no claim is made that
all possible recovery sources are exhausted. Recovery would require a retained,
trustworthy original request identity tied to the exact first book event, and
an explicit repair proposal before any production write.

Validation:
- 68 focused moderation/origin/session tests pass, including A→B account changes
  during delayed moderation, distinct new B requests, cache-only hits, rejected
  credentials, and absence of client-supplied attribution.
- Isolated PostgreSQL/WASM tests pass for first origin, legacy exclusions,
  immutable origin, nullable initiator, ordinary-user/anonymous access denial,
  admin profile lookup, missing profiles, and unchanged origin on later requests.
  This engine serializes sessions; true PostgreSQL lock contention is not tested.
- Production build passes; changed-file lint has no errors and two pre-existing
  hook-dependency warnings in Admin.jsx.
- No deployment or application migration was executed against production.
  The new profile RPC migration must be applied before deploying the new UI.
