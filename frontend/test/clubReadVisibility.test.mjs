import test from 'node:test';
import assert from 'node:assert/strict';
import { isClubChatAtLatest } from '../src/lib/clubReadVisibility.js';

test('only the latest edge qualifies for reading, including short histories and fractional scroll positions', () => {
  assert.equal(isClubChatAtLatest(null), false);
  assert.equal(isClubChatAtLatest({ scrollHeight: 400, clientHeight: 600, scrollTop: 0 }), true);
  assert.equal(isClubChatAtLatest({ scrollHeight: 1500, clientHeight: 600, scrollTop: 899.5 }), true);
  assert.equal(isClubChatAtLatest({ scrollHeight: 1500, clientHeight: 600, scrollTop: 820 }), false);
  assert.equal(isClubChatAtLatest({ scrollHeight: 1500, clientHeight: 600, scrollTop: 0 }), false);
});
