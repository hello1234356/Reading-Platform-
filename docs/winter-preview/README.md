# LitShelf in winter

Set `ACTIVE_SEASON` to `null` in [season.js](../../frontend/src/config/season.js) and rebuild the frontend to restore ordinary LitShelf. [Winter palette tokens](../../frontend/src/styles/winter-palette.css) control the snow and ivory surfaces, dark text, cranberry and evergreen actions. [Winter artwork styles](../../frontend/src/styles/winter.css) position the illustrations.

The quotation slide owns the shoreline and lights. The carousel continues to render each uploaded banner from its configured desktop and mobile images. The desktop tracker and fir scroll with the feed. The fir scales to the available height and is omitted at single-column widths. A single vignette sits on the oak shelf. Larger screens show the book sled and dog, and small screens show the compact snow-globe mantel. The paper margins carry roughly five irregularly spaced snowflakes per screen of content. Personal and public profile portraits carry a mistletoe sprig.

[Winter scenery styles](../../frontend/src/styles/winter-scenery.css) keep the forest clearing inside the Circles empty state. Cedar accents follow section edges, and warm light surrounds the hero lantern and calendar window. Discover’s wrapped books rest on the search-heading divider.

## Browser captures

These screenshots use a synthetic reader, sample posts and local fixture book covers. The mobile Reading capture shows the post and comment snowflake controls.

| View | Desktop · 1440 × 960 | Mobile · 390 × 844 |
| --- | --- | --- |
| Homepage | [Desktop homepage](home-desktop.png) | [Mobile homepage](home-mobile.png) |
| Reading | [Desktop tracker and fir](reading-desktop.png) · [After scrolling](reading-scrolled-desktop.png) | [Mobile feed](reading-mobile.png) |
| Profile | [Desktop profile and Shelf](profile-desktop.png) | [Mobile profile](profile-mobile.png) |
| Discover | [Search](discover-desktop.png) · [Editors’ picks](discover-picks-desktop.png) · [Recommendation Posts](discover-recommendations-desktop.png) | [Search](discover-mobile.png) · [Editors’ picks](discover-picks-mobile.png) · [Recommendation Posts](discover-recommendations-mobile.png) |
| Personal shelves | [Shelves](shelves-desktop.png) · [Reviews](reviews-desktop.png) | [Shelves](shelves-mobile.png) · [Reviews](reviews-mobile.png) |
| Circles | [Populated](circles-desktop.png) · [Empty results](circles-empty-desktop.png) | [Populated](circles-mobile.png) · [Empty results](circles-empty-mobile.png) |
| Events | [Calendar](events-desktop.png) · [Lower calendar](events-lower-desktop.png) | [Calendar](events-mobile.png) · [Lower calendar](events-lower-mobile.png) |

## Artwork

The [winter asset directory](../../frontend/src/assets/seasonal/winter/) contains the coastal photograph, the fir and sled illustrations, and six transparent WebP cutouts from a newly generated Christmas bookshop illustration sheet. The cutouts depict lantern-lit books, wrapped books, a ribbon swag, a snow-globe mantel, a bookshop window with a sleeping dog, and a reading elf. The shelf edge uses wood sampled from the mantel. A small translucent grain tile supplies the paper texture. SVG artwork supplies the fairy lights, botanical accents, snow crystals and calendar heading illustration.

<details>
<summary>ImageGen production prompts</summary>

### shoreline.webp

Use case: photorealistic-natural. A panoramic editorial landscape photograph for a literary magazine's quiet winter coastal essay. Wide horizontal 3:1 composition, a winter saltwater bay on a still morning. An expansive softly lit pale ivory-grey sky fading into sea mist and a calm dove-grey sea with fine wavelets occupy the left two-thirds, completely open, space for a typeset quote added later. At the far right, a slim weathered timber handrail follows a soft snow-dusted dune path down to the shore, bleached winter marram grass and wisps of dry rushes. Delicate distant low land on the horizon over to the right. Photograph on fine-grained film, real tactile snow and timber, lavender-grey shadows, muted warm honey brush, effortless natural coastal composition. The horizon and softly visible rail should be within middle third vertically so a shallow banner crop works. Overcast diffused morning daylight, quiet, understated, recognizable as a real winter coast. Edge-to-edge photograph. No letters, border, logo, people, decorations, lights, buildings, text or composited overlays.

### reading-fir.webp

Use case: illustration-story. Produce an original, portrait-format isolated editorial spot illustration for a literary winter reading site. A lovely tall irregular and airy natural fir, with distinct branching tips painted in deep pine, sage, and softened olive-green strokes. Needle marks in scratchy colored pencil and layers of dry-brush gouache. Sparse miniature hanging clothbound books, two or three tiny tied cranberry silk bows and one fine amber fairy light strand. At its foot two kraft-paper books with tied red twine, and one small sleeping chestnut rough-coated dachshund with a silky dark brown ear, long nose and modest cranberry scarf, curled at the base with nose touching paws. A light broken brushstroke grounds them. Restrained nostalgic vintage picture-book print, slight ink bleed, little imperfections, airy spaces through the lacy branches. The fir is the whole composition and the dog's subordinate silhouettes must remain understandable at 190 pixels wide. Full uncut tree, tip to foot, gentle asymmetric shape. Isolated with genuinely transparent background, open cutout silhouette, no border, no typography, no glow around canvas, no large cast shadow, no background, no paper rectangle.

### shelf-sled.webp

Create one new horizontal companion spot illustration. Use the preceding fir illustration solely as style reference and for the identity and scale of the little dog. The same chestnut rough-coated dachshund with long dark silky ears, soft brown face and long narrow muzzle and little cranberry knitted scarf, now awake and seen in profile on the RIGHT, trotting towards the right, pulling a tiny low vintage wooden runner sled on the LEFT via a taut thin red rope attached to harness. Sled carries three flat clothbound and kraft-paper wrapped books tied with crimson ribbon, tiny pine sprig tucked into knot. Low wide composition in profile, on one shared horizontal baseline, as if printed on a shelf ledge. Dog is approximately the height of the sled and books stack. Capture the expression with just a few confident ink strokes. Match the first illustration's hand-rendered gouache, pigment texture, slightly scratchy colored pencil and natural proportions. A quiet and charming vintage illustrated bookplate. Genuine transparent background; no tree, no backdrop, no caption, no letters, no rectangle, no heavy shadow. Tight bounds on a wide landscape canvas with comfortable margins around whole group.

</details>
