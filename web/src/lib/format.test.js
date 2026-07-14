import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtRelative } from './format.js';

const NOW = Date.UTC(2026, 6, 13, 12, 0, 0); // 2026-07-13T12:00:00Z
const ago = (/** @type {number} */ ms) => new Date(NOW - ms).toISOString();

test('fmtRelative buckets recent times compactly', () => {
  assert.equal(fmtRelative(ago(10 * 1000), NOW), 'just now');
  assert.equal(fmtRelative(ago(5 * 60 * 1000), NOW), '5m');
  assert.equal(fmtRelative(ago(3 * 60 * 60 * 1000), NOW), '3h');
  assert.equal(fmtRelative(ago(2 * 24 * 60 * 60 * 1000), NOW), '2d');
  assert.equal(fmtRelative(ago(3 * 7 * 24 * 60 * 60 * 1000), NOW), '3w');
});

test('fmtRelative falls back to a short date past ~8 weeks', () => {
  const out = fmtRelative(ago(200 * 24 * 60 * 60 * 1000), NOW);
  assert.doesNotMatch(out, /^\d+[mhdw]$/); // not a relative bucket
  assert.ok(out.length > 0);
});

test('fmtRelative returns empty on missing/invalid input', () => {
  assert.equal(fmtRelative(null, NOW), '');
  assert.equal(fmtRelative('', NOW), '');
  assert.equal(fmtRelative('not-a-date', NOW), '');
});
