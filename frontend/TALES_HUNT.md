# Seven-letter club-fair hunt

The frontend contains an unordered collectible inventory, never an intended solution or answer validator. Staff verify submitted arrangements through Teams. Browser tools can still inspect collectible letters and modify local progress; this client-only event is not tamper-proof prize verification.

Locations: P after scrolling to the deeper feed post; R on comment focus; A on personal/public profiles; C in successful search results; T inside the women-write-the-world editorial post; H inside the opened four-favorites picker; E revealed near the tracker after a successful Add to Shelf operation. The shared library API emits `litshelf:book-added` after saving, covering all callers without altering provider or metadata logic.

Seven blocks retain discovery order, then support drag or tap/keyboard swaps. The panel opens when all seven are collected. No answer checking occurs. English and Chinese copy directs users to the existing Teams contacts.

`src/lib/talesHunt.js` owns the flag `TALES_HUNT_ENABLED`, count, reducer, and storage key `litshelf-word-hunt-v2`. The former event key is left untouched and is not loaded. Refresh preserves this round’s letters and arrangement; blocked storage falls back to session state. Reset is available in the development tracker. The new shelf discovery is session-only until collected; after refresh, another successful shelf action can reveal it again.

Existing collection flight, bookmark styling, and varied placements remain. Seven puzzle tiles scroll horizontally when needed to preserve 44px touch targets. New files were not required for this update; changes span the shared hunt components/state/CSS, library API, discovery locations, i18n, and hunt tests.

Validation: build and scoped ESLint pass. Tests cover all 5040 discovery orders, duplicate prevention, all 49 swaps, partial-state restrictions and storage recovery. Live browser/touch checks remain manual because browser automation was unavailable. No deployment, migrations, new dependencies or server configuration were performed.
