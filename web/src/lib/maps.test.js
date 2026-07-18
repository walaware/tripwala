// Unit tests for the map deep-link builders + the map-app preference accessor.
// Run with `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLinks, navUrl, appleMapsUrl, googleMapsUrl } from './maps.js';
import { mapApp, DEFAULT_MAP_APP } from './prefs.js';

test('builds encoded Apple + Google directions links', () => {
  const links = mapLinks('Olmsted Point, Yosemite');
  assert.ok(links);
  assert.equal(links.apple, 'https://maps.apple.com/?daddr=Olmsted%20Point%2C%20Yosemite&dirflg=d');
  assert.equal(links.google, 'https://www.google.com/maps/dir/?api=1&destination=Olmsted%20Point%2C%20Yosemite');
});

test('single-builder helpers match mapLinks', () => {
  const links = mapLinks('Tioga Lake');
  assert.ok(links);
  assert.equal(appleMapsUrl('Tioga Lake'), links.apple);
  assert.equal(googleMapsUrl('Tioga Lake'), links.google);
});

test('encodes a lat,lng destination', () => {
  assert.equal(navUrl('37.8106,-119.4869', 'google'), 'https://www.google.com/maps/dir/?api=1&destination=37.8106%2C-119.4869');
});

test('blank / whitespace place yields no links', () => {
  assert.equal(mapLinks(''), null);
  assert.equal(mapLinks('   '), null);
  assert.equal(mapLinks(null), null);
  assert.equal(navUrl(undefined, 'apple'), null);
});

test('navUrl picks the link for the viewer preference', () => {
  assert.equal(navUrl('Crane Flat', 'google'), googleMapsUrl('Crane Flat'));
  assert.equal(navUrl('Crane Flat', 'apple'), appleMapsUrl('Crane Flat'));
});

test('mapApp normalizes: google explicit, everything else → Apple default', () => {
  assert.equal(DEFAULT_MAP_APP, 'apple');
  assert.equal(mapApp({ map_app: 'google' }), 'google');
  assert.equal(mapApp({ map_app: 'apple' }), 'apple');
  assert.equal(mapApp({ map_app: '' }), 'apple');
  assert.equal(mapApp({}), 'apple');
  assert.equal(mapApp(null), 'apple');
  assert.equal(mapApp(undefined), 'apple');
});
