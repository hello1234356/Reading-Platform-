# LitShelf Book Moderation Audit Recovery Checkpoint

Updated: 2026-08-25 (Asia/Shanghai)

## Original audit goal

Complete an end-to-end audit and repair of LitShelf book search/moderation: provider retrieval, ranking and cache behavior, frontend asynchronous moderation, the `moderate-books` Edge Function, DeepSeek classification/enrichment, evidence and identity handling, persistence, Admin review/manual overrides, book submissions/catalog integration, RLS/security, user-facing states, deployed configuration, and local/deployed drift. Search must remain non-blocking; technical failures must remain distinct from content review. Do not deploy or apply migrations.

## Architecture discovered

- Search: `frontend/src/lib/bookSearch.js`, `googleBooks.js`, `openLibraryBooks.js`, `isbnWorkBooks.js`, `communityBooks.js`, `bookSearchCache.js`, `bookSearchPolicy.js`, `bookSearchRelevance.js`.
- Frontend moderation: `bookModerationApi.js`, `bookModerationStatus.js`, `bookModerationReports.js`, `bookModerationPolicy.js`, `BookModerationStatus.jsx`, `Discover.jsx`, `BookClubs.jsx`.
- Book consumers: `libraryApi.js`, `bookClubApi.js`, review/post/shelf writes.
- Edge: `supabase/functions/moderate-books/{index,classifier,evidence,policy,schema,providerEvidence}.ts`.
- Related Edge: `supabase/functions/isbn-work-books/index.ts`; local cover-repair function is not deployed.
- Admin: `frontend/src/lib/adminApi.js`, `frontend/src/pages/Admin.jsx`.
- Tables: `books`, `book_search_cache`, `book_moderation_assessments`, `book_moderation_events`, `book_submissions`, `book_submission_votes`, `book_moderators`, `admins`, `shelves`, `reviews`, `posts`, `book_clubs`.
- Key RPCs: `review_book_moderation_assessment`, `report_blocked_book_moderation`, `moderate_book_submission`, `cache_book_search`, plus new quota/materialization helpers in migration 012.
- Persisted moderation states: `pending`, `approved`, `review_required`, `blocked`, `error`. Frontend transient translations: `checking`, `failed`.

## Deployed/runtime facts already verified

- Remote `moderate-books` v3 matched the pre-audit local five Edge files byte-for-byte before the current edits; JWT verification is enabled.
- Remote secrets: `DEEPSEEK_API_KEY` exists. `BOOK_MODERATION_MODEL`, enrichment-model override, endpoint overrides, `GOOGLE_BOOKS_API_KEY`, and `ISBN_WORK_APP_KEY` were absent. Secret values were never read or logged.
- Deployed defaults were `deepseek-v4-flash` for classifier and enrichment.
- Migrations through local 202608250011 were listed remotely as applied; local 011 remains untracked and must not be assumed deployed solely from Git status.
- Live assessment aggregates found: current v2 had 10 approved and 75 non-manual errors; old observe policy had 28 automated approved, 48 manual approved, 1 manual blocked, and 84 automated review-required. Forty-nine manual decisions existed only under older policy versions. Seventy-five current error rows had no events.
- Live RLS initially protected assessment/event mutation but did not enforce approved book usage on books/shelves/reviews/posts/clubs.
- Docker was unavailable, so a local schema dump/shadow database could not be used.

## Confirmed bugs found

### Critical/high and in scope

1. Authenticated callers could poison the shared durable moderation cache with arbitrary metadata for a real provider identity and could supply an unrelated `bookId`.
2. New `books` rows could be inserted from client-controlled metadata under an approved identity; moderation was enforced only in UI.
3. The baseline `"Students add books"` RLS policy (`WITH CHECK (true)`) was never dropped by the later differently named policy. PostgreSQL ORs permissive policies, so it bypasses later restrictions.
4. Fresh-schema drift: baseline has `books.cover_image`, while modern code expects `cover_url`; `shelf` is also assumed by current insert code. Live schema has modern columns, but checked-in migrations were not reproducible.
5. Manual decisions from older policy versions were ignored by the current-policy-only cache/Admin behavior. Live data proved 49 affected decisions.
6. Technical `error` rows could be treated as durable cache results; cache lookup failure made the frontend mark every card failed and stop instead of attempting classification.
7. Frontend batch invocation had global failure semantics: a later batch failure could overwrite valid earlier updates; missing Edge identities could stay `checking` forever.
8. Evidence-improvement reclassification reached AI but an `upsert(...ignoreDuplicates)` discarded the updated assessment.
9. Client/model evidence quality could control deterministic policy even when stored server evidence differed.
10. Search merge sliced before ranking; Chinese/ISBN branches searched community-only instead of the full catalog; exact later candidates could be discarded.
11. Open Library detail proxy could return SPA HTML with HTTP 200 and skip direct fallback.
12. ISBN.work exposed a Vite key/client query path; its local Edge function used HTTP and was not deployed.
13. No moderation cost guard existed. A batch can make one Chat call plus targeted per-book enrichment and bounded provider retries.
14. Approved books were usable through direct shelf/review/post/club writes without database-level moderation checks.
15. Community submission approval created a community book without an explicit content-moderation decision.
16. Admin user reports were recorded but had no visible count; technical errors and review tasks needed clearer separation.

### Important but deliberately deferred after scope freeze

- Full transactional coupling of assessment and audit-event persistence (current code checks/logs event failure but an assessment can still survive an event failure).
- Cross-user in-flight identity leases to prevent duplicate simultaneous AI work.
- Full Admin event timeline/actor profile UI and dedicated retry button.
- Read-time hiding/revocation of already-existing content after a later manual block; current migration prevents new/updated restricted writes.
- Search network cancellation (latest-request gates suppress stale state correctly but do not cancel provider bandwidth).
- Automated notification to original searchers after approval: searchers are not stored, so no recipient exists.
- Reversal/unpublishing semantics for an already-approved community submission later changed to rejected.
- Model alias immutability/provenance beyond recording the configured model string.
- Policy choice `!recognized && very_low -> review_required` remains unchanged per instruction; it may create evidence-review volume and should be a separate product decision.

## Fixes completed in the working tree

- Classifier default `deepseek-v4-flash`, 6000-token batch output, concise fields, structured provider errors, explicit truncation, one 10→5+5 retry, mixed-valid-row preservation, bounded retries, disabled thinking, Responses status handling, structured enrichment parse failures.
- Policy version advanced to `school-books-2026-08-v3`; server evidence quality drives policy; threshold-specific review reasons/categories; policy targets unchanged.
- `providerEvidence.ts` added: exact Google/Open Library lookup replaces client metadata; Open Library author keys resolved; community/ISBN.work accepted only when bound to a matching stored book; evidence quality recalculated.
- Schema canonicalizes Google/Open Library/ISBN/community identities and discards arbitrary nested client provider metadata.
- Edge selects the newest durable manual decision across policy versions, retries technical errors after 60 seconds, continues full classification after a full-call cache read failure, checks audit-event errors, updates improved evidence, returns safe failure codes, applies a per-user quota, and returns per-identity provider-verification failures without persisting them.
- Frontend moderation canonicalizes identities, keeps the richest duplicate packet, scopes failures by batch, continues after cache failures, preserves completed siblings, and resolves incomplete responses to technical failure.
- Search merges the full candidate pool before ranking, uses full catalog on Chinese/ISBN paths, fixes one-word token-boundary ranking, extends expected Google fallback cases, and fixes Open Library HTML fallback.
- Search cards remain present for review/blocked/technical states with centralized gatekeeper copy and a real blocked-decision report action.
- ISBN.work frontend key removed; lookup routed through authenticated Edge function over HTTPS.
- Catalog creation in `libraryApi.js` and `bookClubApi.js` now calls `materialize_approved_book`; direct client metadata is no longer inserted.
- Migration 011 records authenticated, deduplicated `user_reported_block` events with structured identity/user context.
- Migration 012 adds manual-identity handling, community identity backfill/trigger, per-user quota, effective moderation helpers, trusted catalog materialization, write policies for books/shelves/reviews/posts/clubs, submission approval→manual moderation upsert, corrected manual-review precedence/reset behavior, and an admin-only effective-assessment list RPC.
- Migration 012 explicitly removes the permissive baseline `"Students add books"` policy and revokes authenticated direct catalog INSERT. It conditionally reconciles legacy `cover_image` into `cover_url`; the historical foundation migration now also creates `cover_url`/`shelf` for reproducible fresh schemas.
- Submission approval now upgrades an existing automated v3 assessment to a human approval instead of silently doing nothing on identity conflict, and records the previous status in the audit event.
- Admin now resolves precedence, status filtering, report counts, ordering, and pagination server-side. It displays reviewer/model/policy/evidence/report fields; technical errors show a safe failure code, are labeled as non-content decisions, and do not offer the normal Block action.

## Work currently in progress / exact interruption point

Implementation and verification are complete. The exact interruption point is final reporting: no confirmed critical/high code work remains. Preserve the working tree; do not deploy or apply migration 012 during handoff.

## Remaining critical/high work

- No confirmed critical/high implementation item remains from the frozen audit scope.
- Operational work remains: review/commit, apply the unapplied migration, deploy functions/frontend, and perform the listed post-deploy smoke tests. None was performed in this audit.

## Migrations created

- `supabase/migrations/202608250011_book_moderation_user_reports.sql` (local/untracked; the remote migration history already contains this timestamp).
- `supabase/migrations/202608250012_book_moderation_integrity.sql` (new, unapplied).

## Tests added/changed

- Added `frontend/test/book-moderation-status.test.mjs`.
- Added `frontend/test/book-moderation-integrity.test.mjs`.
- Expanded `book-moderation-batch.test.mjs`, `book-moderation.test.mjs`, `book-search-cache.test.mjs`, and `bookModerationEvidenceLadder.test.mjs`.
- Final focused moderation/search/integrity suite: **85/85 passed**.
- Final complete frontend suite: **128/128 passed** (`npm test`).
- Scoped ESLint over every changed/new frontend JS/JSX/test file: **passed with zero findings**.
- Production build: **passed** (`npm run build`); Vite emitted only its non-fatal existing >500 kB chunk-size warning.
- Edge TypeScript files under `moderate-books` passed Node's syntax check. The standalone ISBN.work Edge file cannot be meaningfully checked by Node's CommonJS `--check` path because that checker does not parse its TypeScript annotations; its source is covered by static tests.
- Safe linked migration dry run: `npx supabase db push --linked --dry-run --skip-vault` completed and reported **only migration 012 would be pushed**. It did not apply or modify anything. Docker/Postgres were unavailable for a shadow-schema execution, so SQL validation is static/source-based rather than an applied migration test.
- Final `git diff --check`: **passed**.

## Important decisions/assumptions

- No moderation-category expansion or broad genre blacklist.
- Manual decisions are authoritative across automated policy versions.
- Automatic classification never blocks; only humans create final blocked decisions.
- Provider evidence verification failures and all AI/runtime failures are technical, retryable, and excluded from normal content review.
- Unknown + server-verified very-low evidence remains `review_required` for now because the user explicitly asked not to change that policy silently.
- The public editorial Discover page remains visible, but provider book search now requires an authenticated account because the Edge classifier is authenticated/rate-limited.
- Existing unassessed legacy catalog rows are grandfathered for interaction; new provider catalog rows require approved moderation and trusted server materialization.
- No deployment or migration application is authorized.

## Eventual deployment steps (do not run during the audit)

1. Review/commit the working tree.
2. Confirm migration 011's already-recorded remote definition matches the checked-in file, then apply only the pending migration 012 with the linked Supabase migration workflow.
3. Configure server-only `GOOGLE_BOOKS_API_KEY` (recommended) and `ISBN_WORK_APP_KEY` before deploying affected functions; keep `DEEPSEEK_API_KEY` configured. No `BOOK_MODERATION_MODEL` override is required.
4. Deploy `moderate-books` and `isbn-work-books` Edge Functions; `repair-book-cover` is also local-only if that existing feature is expected in production.
5. Redeploy the frontend.
6. Run post-deploy smoke checks for cached/manual decisions, one unknown 10-book batch, Admin content/error filters, blocked-report count, catalog materialization, shelf/review/post/club RLS, and Open Library/Google fallback.
