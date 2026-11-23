// Choose "winter", "october", or null for ordinary LitShelf, then rebuild.
export const ACTIVE_SEASON = "winter";

const octoberKeys = {
  "nav.searchPlaceholder": "october.searchPlaceholder",
  "search.placeholder": "october.searchPlaceholder",
  "home.noPublishedNotes": "october.noPublishedNotes",
};

export function seasonalTranslationKey(key) {
  return ACTIVE_SEASON === "october" ? octoberKeys[key] || key : key;
}
