# Club-fair hidden word hunt

Temporary, client-only event. No deployment, migrations, database changes, or new dependencies are needed. Normal frontend publication is required later to make the changes live; nothing was deployed as part of implementation.

## Files and integration

- `src/lib/talesHunt.js`: single `TALES_HUNT_ENABLED` flag, reducer, storage validation and helpers.
- `src/components/tales/`: shared context/provider, collectible, tracker with scramble controls, and scoped CSS.
- `src/App.jsx`: provider outside the route tree and public profile provider.
- `src/pages/Home.jsx`: L as a paper bookmark at the bottom of the fourth visible feed post (last post on shorter feeds), revealed only after scrolling at least 75% of the viewport height; E beside a focused comment/reply input (no submission needed).
- `src/pages/Profile.jsx`, `src/components/PublicProfileModal.jsx`: S in loaded profile headers, including public profiles opened from posts.
- `src/pages/Discover.jsx`: A in the normal nonempty book results area, after any successful supported provider search.
- `src/pages/RecommendationPost.jsx`: T inside “她们写尽人间” (`women-write-the-world`), below the article header; players must open the post from Discover to see it.
- `src/i18n/en.js`, `src/i18n/zh.js`: all event copy.
- `test/talesHunt.test.mjs`: state, permutation, and persistence tests.

## State and controls

The one localStorage key is `litshelf-tales-hunt`. `collectedLetters` appends unique letters in discovery order. `arrangement` starts in that same order and changes through user swaps once all five letters exist. There is no in-app answer checking or solution reveal: players arrange the letters and send a screenshot to one of the organizers on Microsoft Teams for their prize. The legacy `completed` field is normalized to false so previously completed saves remain editable, with their letters and arrangement preserved. Navigation and language changes retain the mounted provider; refresh restores validated storage. Blocked storage falls back to in-memory session progress.

Location assignments are intentionally mixed: feed L, reply E, editorial post T, search A, profile S. Discovery order still remains unchanged in the tray. Existing saved progress is preserved; use the development reset to test the new locations from scratch.

All five collectibles share a parchment bookmark silhouette, serif ink lettering, a fine top rule, and a small ink dot, using the existing LitShelf palette.

Open the bottom tracker to see hints or the puzzle. Collecting the fifth letter automatically opens the puzzle with bilingual instructions to rearrange the letters and contact the organizers on Teams. Refreshing a five-letter hunt also opens this prompt; dismissing it keeps it closed during ordinary navigation. Drag two tiles to swap, or select two with taps/clicks or keyboard Tab and Enter/Space. Escape closes the panel.

The feed and search bookmarks are centered. The comment bookmark hangs over the input’s upper-right edge without taking up a flex column. The profile bookmark hangs from the profile card’s upper-right edge (lower-right in the public profile header). The editorial bookmark sits off-center under the article header. All retain the same paper design and touch targets.

Set `TALES_HUNT_ENABLED = false` and rebuild to remove all event UI. In Vite development mode, open the panel and use **Reset hunt (development)**. Production has no reset button. For a shared booth browser, progress intentionally belongs to that browser, not an account; staff can clear this one key through developer tools between players.

Prize verification happens through Microsoft Teams: `carrie.wang_28@tsinglan.org`, `jenna.yuan_28@tsinglan.org`, or `yiru.yang_27@tsinglan.org`. The UI lists copyable addresses and asks players to send a screenshot; there is no database prize system or completion callback.

## Validation

Production build and scoped hunt ESLint pass. Four hunt tests cover all 120 discovery orders, duplicate collection, swaps, persistence, corrupt/blocked storage, and migration of previously completed saves into editable arrangements. Browser UI access was unavailable, so the new placements still need visual checks on mobile, desktop, and MAXHUB, especially comment focus and profile edges. Existing search authentication requirements remain in place. No deployment or migrations were performed.
