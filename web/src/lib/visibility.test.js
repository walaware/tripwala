// The two "empty" rules in visibility.js are asymmetric on purpose, and getting
// either backwards has a silent, privacy-visible consequence:
//
//   - a trip with no visibility must read PRIVATE (never retroactively share a
//     trip created before the feature existed);
//   - a NEW trip, for a user with no preference, must default to FRIENDS (or
//     friends' calendars stay empty and the feature looks broken).
//
// Nothing else in the app enforces this, so it is pinned here.
// Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VISIBILITY_TIERS,
  DEFAULT_NEW_TRIP_VISIBILITY,
  VISIBILITY_CHOICES,
  isVisibility,
  tripVisibility,
  defaultTripVisibility
} from './visibility.js';

test('an existing trip with no visibility reads as private', () => {
  assert.equal(tripVisibility({ visibility: '' }), 'private');
  assert.equal(tripVisibility({}), 'private');
  assert.equal(tripVisibility(null), 'private');
  assert.equal(tripVisibility(undefined), 'private');
});

test('a trip with an unrecognised visibility reads as private, never shared', () => {
  for (const bogus of ['public', 'FRIENDS', 'busy ', 0, true, {}, []]) {
    assert.equal(tripVisibility({ visibility: bogus }), 'private', `"${String(bogus)}" leaked`);
  }
});

test('a trip with a known tier reads back unchanged', () => {
  for (const tier of VISIBILITY_TIERS) {
    assert.equal(tripVisibility({ visibility: tier }), tier);
  }
});

test('a new trip defaults to friends when the creator has no preference', () => {
  assert.equal(defaultTripVisibility({}), 'friends');
  assert.equal(defaultTripVisibility({ default_trip_visibility: '' }), 'friends');
  assert.equal(defaultTripVisibility(null), 'friends');
  assert.equal(DEFAULT_NEW_TRIP_VISIBILITY, 'friends');
});

test("a new trip honours the creator's saved preference", () => {
  for (const tier of VISIBILITY_TIERS) {
    assert.equal(defaultTripVisibility({ default_trip_visibility: tier }), tier);
  }
});

test('an unrecognised preference falls back to the default, not to whatever was stored', () => {
  assert.equal(defaultTripVisibility({ default_trip_visibility: 'public' }), 'friends');
});

test('isVisibility accepts exactly the three tiers', () => {
  for (const tier of VISIBILITY_TIERS) assert.ok(isVisibility(tier));
  for (const bogus of ['public', '', null, undefined, 0, 'Private']) assert.ok(!isVisibility(bogus));
});

test('the tier pickers offer every tier, in privacy order', () => {
  assert.deepEqual(
    VISIBILITY_CHOICES.map((c) => c.value),
    ['private', 'busy', 'friends']
  );
  for (const c of VISIBILITY_CHOICES) {
    assert.ok(c.label, `${c.value} needs a label`);
    assert.ok(c.hint, `${c.value} needs a hint`);
  }
});
