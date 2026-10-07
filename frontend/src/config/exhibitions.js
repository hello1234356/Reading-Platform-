export const DEFAULT_EXHIBITION_SLUG = "halloween-ghosts";

export const exhibitions = {
  "halloween-ghosts": {
    slug: "halloween-ghosts",
    archiveMark: "No. 10",
    themeClass: "exhibition-theme-haunted",
    eyebrow: "Library Exhibition",
    title: "Submit Your Spooky Read!",
    ariaLabel: "Recommend a book for the Halloween and ghosts exhibition",
    intro:
      "Know a book that belongs on the haunted shelf? Send us your favorite ghostly, eerie, or mysterious read for our Halloween exhibition!",
    noteTitle: "A Quietly Haunted Shelf",
    note:
      "Send the library a ghost story, a gothic classic, a strange campus mystery, or any book that feels like a candle left burning after midnight.",
    descriptionLabel: "Why This Book?",
    descriptionPlaceholder: "",
    submitLabel: "Send to the Ghostly Realm 🎃👻",
    submittingLabel: "Sending...",
    confirmation:
      "Your recommendation has been received. We'll see whether it makes its way onto the shelves...",
    event: {
      title: "Halloween & Ghosts",
      subtitle: "Library Pop-Up Exhibition",
      startDate: "2026-10-10",
      endDate: "2026-11-01",
      location: "Tsinglan Library",
      accentClass: "event-accent-haunted",
      calendarIcon: "👻",
      calendarTitle: "Halloween & Ghosts——Library Pop-Up",
      bannerKicker: "Now Accepting Book Recommendations",
      bannerTitle: "Halloween & Ghosts -- Library Pop-Up",
      bannerText:
        "Help fill our haunted shelves. Send us a spooky read.",
      description:
        "A seasonal exhibition exploring ghost stories, haunted places, folklore, the supernatural, and the books that stay with us after the lights go out.",
      participationTitle: "Want to contribute?",
      participationText: "Submit a book recommendation for consideration.",
      ctaLabel: "Submit a Recommendation",
    },
  },
};

export function getCurrentExhibition() {
  return exhibitions[DEFAULT_EXHIBITION_SLUG];
}

export function getExhibition(slug = DEFAULT_EXHIBITION_SLUG) {
  return exhibitions[slug] || getCurrentExhibition();
}

export function getExhibitionEvents() {
  return Object.values(exhibitions)
    .filter((exhibition) => exhibition.event)
    .map((exhibition) => ({
      ...exhibition.event,
      slug: exhibition.slug,
      formPath: `/exhibitions/${exhibition.slug}/recommend`,
      eventPath: `/events/${exhibition.slug}`,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
