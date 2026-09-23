// Editorial source: add only confirmed information. Photo paths belong in public/events/.
// Blocks: { heading?, text?, image?, alt?, caption? }, with localized text objects.
export const events = [
  { slug: "library-book-display", status: "open", title: { en: "Your next favourite, on display.", "zh-CN": "让你的好书推荐，走进图书馆。" },
    name: { en: "Library Book Display", "zh-CN": "图书馆好书推荐展" },
    summary: { en: "Share a book, a quote, and why it stayed with you. Help shape our school library’s student book display.", "zh-CN": "分享一本书、一段摘录，以及你的推荐理由，一起打造学校图书馆的学生好书推荐展。" } },
  { slug: "wallflower-reading-circle", status: "soon", title: { en: "The Perks of Being a Wallflower", "zh-CN": "《壁花少年》" },
    name: { en: "Our first official Reading Circle", "zh-CN": "我们的首个正式共读圈" },
    summary: { en: "One book. Different perspectives. Our first official Reading Circle is coming soon.", "zh-CN": "同一本书，不同的视角。LitShelf 首个正式共读圈即将开启。" },
    bookQuery: "The Perks of Being a Wallflower Stephen Chbosky", circleId: null,
    blocks: [{ text: { en: "We’ve chosen Stephen Chbosky’s The Perks of Being a Wallflower for LitShelf’s first official Reading Circle. We’ll read together, make space for online and offline discussion, explore related activities, and eventually turn to the film adaptation.", "zh-CN": "我们选择了斯蒂芬·卓博斯基的《壁花少年》，作为 LitShelf 首个正式共读圈的书目。我们将一起阅读，开展线上与线下讨论，探索相关活动，并在之后欣赏电影改编。" } }, { text: { en: "Dates, the reading schedule, and activities are still being planned. We’ll share the details here when they’re ready.", "zh-CN": "具体日期、阅读进度和活动安排仍在筹备中。确定后，我们会在这里公布。" } }] },
  { slug: "gen-z-reading-festival", status: "recap", title: { en: "Gen Z Reading Festival", "zh-CN": "Gen Z 阅读节" },
    name: { en: "Recently at school", "zh-CN": "校园近期活动" },
    summary: { en: "A place to revisit our recent school reading festival. The team’s recap and photos are on their way.", "zh-CN": "回顾近期的校园阅读节。团队正在整理回顾文章与照片，敬请期待。" },
    date: null, blocks: [] },
];
export function eventText(value, language) { return value?.[language] || value?.en || ""; }
