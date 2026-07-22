// Unit tests for trip hero image precedence. Pure functions, no PocketBase.
// Run: `pnpm test`
//
// The per-type default is passed IN rather than looked up here — resolving it
// needs import.meta.glob, a Vite-only transform. That split is what makes this
// logic testable under plain node at all, so these tests exercise both the
// "artwork added" and "artwork not added yet" cases by varying the argument.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripHeroSrc, heroIsPhoto } from './tripHero.js';

test('tripHeroSrc: an uploaded trip cover wins over everything', () => {
  const src = tripHeroSrc({
    heroImage: '/api/files/trips/t1/cover.webp',
    trip_type: 'camping',
    pickedLocation: { image: '/api/files/location_ideas/i1/photo.jpg', previewImage: 'https://x/og.png' }
  });
  assert.equal(src, '/api/files/trips/t1/cover.webp');
});

test("tripHeroSrc: falls back to the picked location's uploaded photo", () => {
  const src = tripHeroSrc({
    trip_type: 'beach',
    pickedLocation: { image: '/api/files/location_ideas/i1/photo.jpg', previewImage: 'https://x/og.png' }
  });
  assert.equal(src, '/api/files/location_ideas/i1/photo.jpg');
});

test('tripHeroSrc: then the scraped link preview', () => {
  const src = tripHeroSrc({ trip_type: 'city', pickedLocation: { previewImage: 'https://x/og.png' } });
  assert.equal(src, 'https://x/og.png');
});

test('tripHeroSrc: a trip with no artwork resolves to empty, not a broken URL', () => {
  assert.equal(tripHeroSrc({ trip_type: 'ski' }), '');
  assert.equal(tripHeroSrc({ trip_type: 'ski', pickedLocation: null }), '');
  assert.equal(tripHeroSrc({}), '');
});

test('tripHeroSrc: tolerates null/undefined trips', () => {
  assert.equal(tripHeroSrc(null), '');
  assert.equal(tripHeroSrc(undefined), '');
  // …and still yields the type artwork if the caller had one.
  assert.equal(tripHeroSrc(null, '/assets/hero/other.webp'), '/assets/hero/other.webp');
});

test('tripHeroSrc: the generated default is the last resort, never an override', () => {
  const generated = '/assets/hero/camping-abc123.webp';
  // Present but outranked at every earlier tier…
  assert.equal(
    tripHeroSrc({ heroImage: '/api/files/trips/t1/c.webp' }, generated),
    '/api/files/trips/t1/c.webp'
  );
  assert.equal(
    tripHeroSrc({ pickedLocation: { image: '/api/files/location_ideas/i1/p.jpg' } }, generated),
    '/api/files/location_ideas/i1/p.jpg'
  );
  assert.equal(
    tripHeroSrc({ pickedLocation: { previewImage: 'https://x/og.png' } }, generated),
    'https://x/og.png'
  );
  // …and used only when nothing else resolves.
  assert.equal(tripHeroSrc({ trip_type: 'camping' }, generated), generated);
});

test('tripHeroSrc: a missing default for one type still resolves to empty', () => {
  // heroDefaultSrc returns '' for a type whose artwork hasn't been added yet.
  assert.equal(tripHeroSrc({ trip_type: 'ski' }, ''), '');
});

test('tripHeroSrc: an empty-string cover does not shadow the location photo', () => {
  // loadTrip returns '' (not undefined) when there's no upload, so falsy-not-
  // nullish handling matters here.
  const src = tripHeroSrc({
    heroImage: '',
    trip_type: 'cabin',
    pickedLocation: { image: '/api/files/location_ideas/i9/pic.jpg' }
  });
  assert.equal(src, '/api/files/location_ideas/i9/pic.jpg');
});

test('heroIsPhoto: true only when a real photo backs the trip', () => {
  assert.equal(heroIsPhoto({ heroImage: '/api/files/trips/t1/c.webp' }), true);
  assert.equal(heroIsPhoto({ pickedLocation: { image: '/api/files/location_ideas/i1/p.jpg' } }), true);
  assert.equal(heroIsPhoto({ pickedLocation: { previewImage: 'https://x/og.png' } }), true);
});

test('heroIsPhoto: false for generated type artwork or nothing at all', () => {
  // No photo tiers set → whatever renders is the generated default, which is
  // already low-contrast and must not get the heavier photo scrim.
  assert.equal(heroIsPhoto({ trip_type: 'festival' }), false);
  assert.equal(heroIsPhoto({ heroImage: '', pickedLocation: null }), false);
  assert.equal(heroIsPhoto(null), false);
});
