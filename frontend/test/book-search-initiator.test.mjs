import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSearchModerationInvoker, moderateBookSearchResults } from '../src/lib/bookModerationApi.js';

const books = Array.from({ length: 12 }, (_, i) => ({
  source: 'google_books', externalId: `book-${i}`, title: `Book ${i}`,
}));
function clientFixture() {
  let account = 'A';
  const calls = [];
  return {
    calls, switchAccount: (next) => { account = next; },
    client: {
      auth: { getSession: async () => ({ data: { session: account ? {
        user: { id: account }, access_token: `signed-token-${account}`,
      } : null } }) },
      functions: { invoke: async (name, options) => {
        calls.push({ name, ...options });
        return { data: { results: options.body.books.map((book) => ({
          ...book, cached: false, status: options.body.cacheOnly ? 'checking' : 'approved',
        })) } };
      } },
    },
  };
}

test('A search keeps A credentials across delayed provider work, cache lookup and multiple AI batches', async () => {
  const fixture = clientFixture();
  const invokeA = await createSearchModerationInvoker(fixture.client);
  fixture.switchAccount('B');
  await moderateBookSearchResults(books, () => {}, 0, invokeA);
  assert.ok(fixture.calls.some((call) => call.body.cacheOnly));
  assert.equal(fixture.calls.filter((call) => !call.body.cacheOnly).length, 3);
  for (const call of fixture.calls) {
    assert.equal(call.headers.Authorization, 'Bearer signed-token-A');
    assert.deepEqual(Object.keys(call.body).sort(), ['books', 'cacheOnly']);
  }
  fixture.calls.length = 0;
  const invokeB = await createSearchModerationInvoker(fixture.client);
  await moderateBookSearchResults(books, () => {}, 0, invokeB);
  assert.ok(fixture.calls.every((call) => call.headers.Authorization === 'Bearer signed-token-B'));
});

test('cached decisions never issue an AI request', async () => {
  const fixture = clientFixture();
  fixture.client.functions.invoke = async (_name, options) => {
    fixture.calls.push(options);
    return { data: { results: options.body.books.map((book) => ({
      ...book, cached: true, status: 'approved',
    })) } };
  };
  await moderateBookSearchResults(books, () => {}, 0, await createSearchModerationInvoker(fixture.client));
  assert.ok(fixture.calls.every((call) => call.body.cacheOnly));
});

test('missing authentication cannot fall back to another actor', async () => {
  const fixture = clientFixture();
  fixture.switchAccount(null);
  await assert.rejects(createSearchModerationInvoker(fixture.client), /Sign in/);
  assert.equal(fixture.calls.length, 0);
});

test('rejected original credentials never retry using the later active session', async () => {
  const fixture = clientFixture();
  fixture.client.functions.invoke = async (_name, options) => {
    fixture.calls.push(options);
    return { error: new Error('Expired token') };
  };
  const invoke = await createSearchModerationInvoker(fixture.client);
  fixture.switchAccount('B');
  const statuses = [];
  await moderateBookSearchResults(books, (_key, status) => statuses.push(status), 0, invoke);
  assert.ok(statuses.every((status) => status === 'failed'));
  assert.ok(fixture.calls.every((call) => call.headers.Authorization === 'Bearer signed-token-A'));
});

test('search captures before provider work; shared club cache cannot retain user-bound callbacks', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
  const search = (await read('../src/lib/bookSearch.js')).split('export async function searchBooksByQueryLanguage(')[1];
  assert.ok(search.indexOf('await createSearchModerationInvoker()') < search.indexOf('await searchBooksByQueryLanguageRaw('));
  const clubs = await read('../src/pages/BookClubs.jsx');
  assert.doesNotMatch(clubs, /bookClubQueryCache/);
  const ui = await read('../src/pages/Admin.jsx');
  assert.match(ui, /Searched by[\s\S]*<ProfileLink userId=\{origin.initiated_by_user_id\}/);
  assert.doesNotMatch(ui, /Initiated by user:/);
});
