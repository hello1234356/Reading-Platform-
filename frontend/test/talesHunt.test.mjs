import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyHunt, huntReducer, normalizeHunt, readHunt, saveHunt } from '../src/lib/talesHunt.js';
function permutations(items) { return items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest])) : [[]]; }
test('all 120 discovery orders stay intact, ignore duplicates, and leave judging to the organizers', () => {
  for (const order of permutations(['T','A','L','E','S'])) {
    let state = emptyHunt();
    for (const letter of order) {
      state = huntReducer(state, { type: 'collect', letter });
      assert.equal(huntReducer(state, { type: 'collect', letter }), state);
    }
    assert.deepEqual(state.arrangement, order);
    assert.equal(state.completed, false);
    assert.equal(huntReducer(state, { type: 'check' }), state);
    for (const [to, letter] of [...'TALES'].entries()) state = huntReducer(state, { type: 'swap', from: state.arrangement.indexOf(letter), to });
    assert.deepEqual(state.collectedLetters, order);
    state = huntReducer(state, { type: 'check' });
    assert.equal(state.completed, false);
    assert.equal(huntReducer(state, { type: 'check' }), state);
    assert.deepEqual(huntReducer(state, { type: 'reset' }), emptyHunt());
  }
});
test('all swaps preserve unique tiles; wrong guesses stay editable', () => {
  let state = normalizeHunt({ collectedLetters: [...'LSATE'] });
  for (let from = 0; from < 5; from++) for (let to = 0; to < 5; to++) {
    state = huntReducer(state, { type: 'swap', from, to });
    assert.equal(new Set(state.arrangement).size, 5);
    assert.deepEqual([...state.arrangement].sort(), [...'AELST']);
  }
  assert.equal(huntReducer(emptyHunt(), { type: 'check' }).completed, false);
  assert.equal(huntReducer(state, { type: 'swap', from: -1, to: 8 }), state);
});
test('storage round trips partial and rearranged progress; corrupt or blocked storage recovers', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  for (const state of [normalizeHunt({ collectedLetters: [...'LS'] }), normalizeHunt({ collectedLetters: [...'LSATE'], arrangement: [...'TALES'], completed: true })]) {
    saveHunt(storage, state);
    assert.deepEqual(readHunt(storage), state);
  }
  saved = '{invalid'; assert.deepEqual(readHunt(storage), emptyHunt());
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.deepEqual(readHunt(blocked), emptyHunt());
  assert.doesNotThrow(() => saveHunt(blocked, emptyHunt()));
  assert.deepEqual(normalizeHunt({ collectedLetters: ['L','L','X','S'], arrangement: ['T'], completed: true }), { collectedLetters: ['L','S'], arrangement: ['L','S'], completed: false });
});

test('previously completed saves become editable without losing the arranged letters', () => {
  const state = normalizeHunt({ collectedLetters: [...'LETAS'], arrangement: [...'TALES'], completed: true });
  assert.equal(state.completed, false);
  assert.deepEqual(state.arrangement, [...'TALES']);
  assert.deepEqual(huntReducer(state, { type: 'swap', from: 0, to: 1 }).arrangement, [...'ATLES']);
});
