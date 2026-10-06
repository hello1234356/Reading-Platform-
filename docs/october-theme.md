# October atmosphere

The single switch is `ACTIVE_SEASON` in `frontend/src/config/season.js`.
Set it to `null` and rebuild to disable October styling **and** seasonal copy.
Set it to `"october"` to enable it. It never depends on the visitor's date.

`main.jsx` applies the switch to the document root as `data-season` so shared
surfaces and portaled dialogs use the same palette. All seasonal CSS is isolated
in `frontend/src/styles/october.css`; English and Chinese seasonal strings live
under `october` in the existing translation files. Original strings remain intact.

The seasonal hierarchy is a single hero vignette, pumpkin ratings, and a fine
corner web. The cat sits behind overlapping orange and ivory pumpkins in one
transparent ink-and-watercolor asset; its lower edge is cropped by the hero.
The web has irregular fading filaments that start outside the same surface.
Floating motifs, navbar icons, divider icons and standalone empty-state icons
have been removed. The navbar retains only seasonal colors.

Artwork and its generation prompt are documented in [october-artwork.md](october-artwork.md).
The shared `StarRating` switches only its glyph during October; full and half
fills, numeric values, hit targets and accessible labels remain unchanged.
Disabling the switch restores the original book glyph. All decoration is silent
and noninteractive, hidden outside October, and entirely static.

Phones retain a smaller vignette and finer web. Bottom-aligned custom banner
captions hide the vignette so copy takes priority.

Layout, imagery, typography, and the permanent corner geometry in
`section-corners.css` are independent of this theme.

Secondary sections echo the same ink through selected grade-card webs and a
thread attached to the Reading Notes divider. Feed cards stay clean: only the
seventh visible card has a small upper-corner web; pumpkin ratings and seasonal
borders carry the rest. There are no tracker vines, footer ornaments, or repeated
pumpkin separators beneath posts or inputs.

Inner pages use at most three illustrations tied to existing components:
- Profile: a challenge-card web, tracker-heading thread, and web on the first
  shelf card (including when that shelf is empty). Its banner and progress bars
  receive autumn/wine tints. Shelf detail pages retain a heading thread.
- Discover: recent-finishes heading thread and featured-pick corner web.
- Events: heading thread and first event-card web; event detail has one header web.
- Clubs: heading thread and first club-card web; rooms have one member-panel web.
- Recommendation articles and login: one corner web on the main surface.

All artwork occupies existing corners/padding, scales down on phones, stays
noninteractive, and disappears with the season switch. No geometry, layout,
spacing, typography, content or functionality depends on these accents.
