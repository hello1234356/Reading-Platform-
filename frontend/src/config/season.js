// Set to null to disable ALL October styling and copy. No visitor-date logic.
export const ACTIVE_SEASON = "october";

const octoberKeys = {
  "nav.searchPlaceholder": "october.searchPlaceholder",
  "search.placeholder": "october.searchPlaceholder",
  "home.noPublishedNotes": "october.noPublishedNotes",
};

export function seasonalTranslationKey(key) {
  return ACTIVE_SEASON === "october" ? octoberKeys[key] || key : key;
}
