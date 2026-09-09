import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyHunt, huntReducer, normalizeHunt, readHunt, saveHunt, HUNT_LETTER_COUNT } from '../src/lib/talesHunt.js';
const inventory = [...'PRACTHE'];
function permutations(items) { return items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest])) : [[]]; }
test('all 5040 discovery orders preserve seven unique letters without judging the answer', () => {
  assert.equal(HUNT_LETTER_COUNT, 7);
  for (const order of permutations(inventory)) {
    let state = emptyHunt();
    for (const letter of order) {
      state = huntReducer(state, { type: 'collect', letter });
      assert.equal(huntReducer(state, { type: 'collect', letter }), state);
    }
    assert.deepEqual(state.arrangement, order);
    assert.equal(huntReducer(state, { type: 'check' }), state);
    assert.equal(state.completed, false);
  }
});
test('seven-tile swaps remain editable and do not change discovery order', () => {
  const initial = normalizeHunt({ collectedLetters: inventory });
  for (let from = 0; from < 7; from++) for (let to = 0; to < 7; to++) {
    const state = huntReducer(initial, { type: 'swap', from, to });
    assert.equal(new Set(state.arrangement).size, 7);
    assert.equal(state.arrangement[to], inventory[from]);
    assert.deepEqual(state.collectedLetters, inventory);
  }
  const partial = normalizeHunt({ collectedLetters: inventory.slice(0, 5) });
  assert.equal(huntReducer(partial, { type: 'swap', from: 0, to: 1 }), partial);
  assert.deepEqual(huntReducer(initial, { type: 'reset' }), emptyHunt());
});
test('persistence preserves arrangement and recovers from blocked or corrupt storage', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const state = huntReducer(normalizeHunt({ collectedLetters: inventory }), { type: 'swap', from: 0, to: 6 });
  saveHunt(storage, state);
  assert.deepEqual(readHunt(storage), state);
  saved = '{bad'; assert.deepEqual(readHunt(storage), emptyHunt());
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.deepEqual(readHunt(blocked), emptyHunt());
  assert.doesNotThrow(() => saveHunt(blocked, state));
  assert.deepEqual(normalizeHunt({ collectedLetters: ['P', 'P', 'X'], arrangement: ['X'] }).arrangement, ['P']);
});
