// Temporary club-fair event: set false to remove every hunt surface.
export const TALES_HUNT_ENABLED = true;
export const HUNT_STORAGE_KEY = 'litshelf-word-hunt-v2';
// Collectible inventory only, deliberately unordered; no solution is stored here.
const letters = new Set(['P', 'R', 'A', 'C', 'T', 'H', 'E']);
export const HUNT_LETTER_COUNT = letters.size;
export const emptyHunt = () => ({ collectedLetters: [], arrangement: [], completed: false });
export function normalizeHunt(value) {
  const collectedLetters = [...new Set((Array.isArray(value?.collectedLetters) ? value.collectedLetters : []).filter(letter => letters.has(letter)))];
  const order = value?.arrangement;
  const arrangement = Array.isArray(order) && order.length === collectedLetters.length && new Set(order).size === order.length && order.every(letter => collectedLetters.includes(letter)) ? order : [...collectedLetters];
  // Keep the legacy field for saved-state compatibility; prizes are verified by organizers on Teams.
  return { collectedLetters, arrangement, completed: false };
}
export function huntReducer(state, action) {
  if (action.type === 'reset') return emptyHunt();
  if (action.type === 'collect' && letters.has(action.letter) && !state.collectedLetters.includes(action.letter)) {
    return { ...state, collectedLetters: [...state.collectedLetters, action.letter], arrangement: [...state.arrangement, action.letter] };
  }
  if (action.type === 'swap' && state.arrangement.length === HUNT_LETTER_COUNT && [action.from, action.to].every(i => Number.isInteger(i) && i >= 0 && i < HUNT_LETTER_COUNT)) {
    const arrangement = [...state.arrangement];
    [arrangement[action.from], arrangement[action.to]] = [arrangement[action.to], arrangement[action.from]];
    return { ...state, arrangement };
  }
  return state;
}
export function readHunt(storage) {
  try { return normalizeHunt(JSON.parse(storage.getItem(HUNT_STORAGE_KEY))); } catch { return emptyHunt(); }
}
export function saveHunt(storage, state) {
  try { storage.setItem(HUNT_STORAGE_KEY, JSON.stringify(state)); } catch { /* Session state remains usable. */ }
}
