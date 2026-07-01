// Unit tests for the "someday" wishlist shaping helper: idea cards carry the
// title, optional location, the viewer's role, and a co-organizer avatar group
// with the viewer first; newest idea sorts first. Run with `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeIdeas } from './ideas.js';
import { participantName } from '../displayName.js';

/** @param {string} id @param {Record<string, any>} [over] */
const trip = (id, over = {}) => ({
  id,
  name: `Idea ${id}`,
  share_token: `trip-${id}`,
  location: '',
  created: '2026-06-01 00:00:00.000Z',
  ...over
});
/** @param {string} t @param {string} user @param {string} display_name */
const part = (t, user, display_name) => ({ trip: t, user, display_name });

test('shapes an idea card: title, slug, location, role, members', () => {
  const trips = [trip('t1', { name: 'Vancouver Island', location: 'BC', share_token: 'trip-a-b-c' })];
  const participants = [part('t1', 'u1', 'Sam'), part('t1', 'u2', 'Bo')];
  const [card] = shapeIdeas(trips, participants, { t1: 'organizer' }, 'u1');

  assert.equal(card.name, 'Vancouver Island');
  assert.equal(card.slug, 'trip-a-b-c');
  assert.equal(card.location, 'BC');
  assert.equal(card.role, 'organizer');
  assert.equal(card.members, 2);
  assert.equal(card.people.length, 2);
});

test('puts the viewer first in the avatar group', () => {
  const trips = [trip('t1')];
  const participants = [part('t1', 'u2', 'Bo'), part('t1', 'u1', 'MePerson')];
  const [card] = shapeIdeas(trips, participants, { t1: 'guest' }, 'u1');

  assert.equal(card.people[0].name, participantName(part('t1', 'u1', 'MePerson')));
  assert.equal(card.people[1].name, participantName(part('t1', 'u2', 'Bo')));
});

test('sorts newest idea first', () => {
  const trips = [
    trip('old', { created: '2026-01-01 00:00:00.000Z' }),
    trip('new', { created: '2026-09-01 00:00:00.000Z' })
  ];
  const out = shapeIdeas(trips, [], {}, 'u1');
  assert.deepEqual(
    out.map((c) => c.id),
    ['new', 'old']
  );
});

test('solo idea with no other members: one person, defaults role guest', () => {
  const trips = [trip('t1')];
  const participants = [part('t1', 'u1', 'Sam')];
  const [card] = shapeIdeas(trips, participants, {}, 'u1');

  assert.equal(card.members, 1);
  assert.equal(card.role, 'guest');
});

test('an idea with no participants renders with an empty group', () => {
  const [card] = shapeIdeas([trip('t1')], [], { t1: 'organizer' }, 'u1');
  assert.equal(card.members, 0);
  assert.deepEqual(card.people, []);
});
