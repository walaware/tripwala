// Guards the members-only boundary for Surface B: the friend calendar must show
// ONLY friends-visible, non-ended trips, projected to a teaser that never carries
// a share_token or any private field. A fake pb feeds preset collection data.
// Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFriendsCalendar } from './calendar.js';

/** Far-future / past dates relative to any real run. */
const FUTURE = '2999-08-01';
const FUTURE_END = '2999-08-07';
const PAST = '2000-01-01';

/** @param {Record<string, any[]>} store @returns {any} */
function fakePb(store) {
  return {
    filter: () => '',
    /** @param {string} name */
    collection(name) {
      return {
        getFullList: async () => store[name] ?? [],
        /** @param {string} id */
        getOne: async (id) => (store[name] ?? []).find((r) => r.id === id)
      };
    }
  };
}

/** @param {string} trip @param {string} userId @param {string} name */
const friendMembership = (trip, userId, name) => ({
  trip,
  user: userId,
  expand: { user: { id: userId, name } }
});

function baseStore() {
  return {
    friendships: [{ id: 'fr1', user_low: 'f1', user_high: 'me', status: 'accepted' }],
    participants: [friendMembership('tPub', 'f1', 'Fiona Friend')],
    trips: [
      {
        id: 'tPub',
        name: 'Beach Week',
        location: 'Tofino',
        start_date: `${FUTURE} 00:00:00.000Z`,
        end_date: `${FUTURE_END} 00:00:00.000Z`,
        visibility: 'friends',
        status: 'confirmed',
        // Private fields that must NEVER appear in a teaser:
        share_token: 'beach-mossy-otter',
        owner_token: 'supersecrettoken',
        description: 'Private itinerary details',
        expense_link: 'https://spliit.app/secret'
      }
    ]
  };
}

test('teaser carries only public fields — never share_token or private data', async () => {
  const teasers = await loadFriendsCalendar(fakePb(baseStore()), 'me');
  assert.equal(teasers.length, 1);
  const t = teasers[0];
  const keys = Object.keys(t);
  for (const forbidden of ['share_token', 'owner_token', 'description', 'expense_link']) {
    assert.ok(!keys.includes(forbidden), `teaser leaked "${forbidden}"`);
  }
  assert.deepEqual(new Set(keys), new Set(['id', 'name', 'start_date', 'end_date', 'location', 'friends']));
  assert.equal(t.name, 'Beach Week');
  assert.equal(t.friends[0].name, 'Fiona');
});

test('a private-visibility trip is never shown', async () => {
  const store = baseStore();
  store.trips[0].visibility = 'private';
  const teasers = await loadFriendsCalendar(fakePb(store), 'me');
  assert.equal(teasers.length, 0);
});

test('empty/absent visibility reads as private (excluded)', async () => {
  const store = baseStore();
  store.trips[0].visibility = '';
  const teasers = await loadFriendsCalendar(fakePb(store), 'me');
  assert.equal(teasers.length, 0);
});

test('an already-ended trip is dropped', async () => {
  const store = baseStore();
  store.trips[0].start_date = `${PAST} 00:00:00.000Z`;
  store.trips[0].end_date = `${PAST} 00:00:00.000Z`;
  const teasers = await loadFriendsCalendar(fakePb(store), 'me');
  assert.equal(teasers.length, 0);
});

test('idea-stage trips never appear on the calendar', async () => {
  const store = baseStore();
  store.trips[0].status = 'idea';
  const teasers = await loadFriendsCalendar(fakePb(store), 'me');
  assert.equal(teasers.length, 0);
});

test('no friends → no teasers', async () => {
  const store = baseStore();
  store.friendships = [];
  const teasers = await loadFriendsCalendar(fakePb(store), 'me');
  assert.equal(teasers.length, 0);
});
