import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasCoords, clampNum } from './coords.js';

test('hasCoords: real picked coordinates are set', () => {
  assert.equal(hasCoords(34.38, -117.69), true); // Big Pines, CA
  assert.equal(hasCoords(-33.86, 151.21), true); // Sydney
  assert.equal(hasCoords('34.38', '-117.69'), true); // stringy numbers
});

test('hasCoords: the 0,0 default reads as unset', () => {
  assert.equal(hasCoords(0, 0), false);
  assert.equal(hasCoords('0', '0'), false);
});

test('hasCoords: rejects non-finite and out-of-range', () => {
  assert.equal(hasCoords(null, null), false);
  assert.equal(hasCoords(undefined, 5), false);
  assert.equal(hasCoords(NaN, 5), false);
  assert.equal(hasCoords(91, 0), false); // lat out of range
  assert.equal(hasCoords(0, 181), false); // lng out of range
});

test('hasCoords: a real point on the equator/prime meridian (but not both) is set', () => {
  assert.equal(hasCoords(0, 10), true);
  assert.equal(hasCoords(10, 0), true);
});

test('clampNum: clamps into range and rejects non-numbers', () => {
  assert.equal(clampNum(200, -180, 180), 180);
  assert.equal(clampNum(-200, -180, 180), -180);
  assert.equal(clampNum(45.2, -90, 90), 45.2);
  assert.equal(clampNum('45.2', -90, 90), 45.2);
  assert.equal(clampNum('nope', -90, 90), null);
  assert.equal(clampNum(undefined, -90, 90), null);
  assert.equal(clampNum(NaN, -90, 90), null);
});
