// isTripPast — the trigger for the post-trip space.
//
// Run: `pnpm test`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTripPast } from './tripStatus.js';

// LOCAL date math, matching isTripPast's "today": a trip stays ongoing until
// local midnight, so "yesterday" must be the local calendar's yesterday. (UTC
// math here made this test fail every evening west of Greenwich.)
const daysFromNow = (/** @type {number} */ n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('isTripPast: completed status always counts, regardless of dates', () => {
  assert.equal(isTripPast({ status: 'completed', end_date: daysFromNow(30) }), true);
  assert.equal(isTripPast({ status: 'completed' }), true);
});

test('isTripPast: a trip whose end date has passed is past', () => {
  assert.equal(isTripPast({ end_date: daysFromNow(-1) }), true);
  // single-day trip: start_date stands in for end_date
  assert.equal(isTripPast({ start_date: daysFromNow(-3) }), true);
});

test('isTripPast: today and future trips are not past', () => {
  assert.equal(isTripPast({ end_date: daysFromNow(0) }), false); // ends today → still ongoing
  assert.equal(isTripPast({ end_date: daysFromNow(5) }), false);
  assert.equal(isTripPast({ start_date: daysFromNow(2) }), false);
});

test('isTripPast: no dates and no status is not past', () => {
  assert.equal(isTripPast({}), false);
  assert.equal(isTripPast({ end_date: '' }), false);
  assert.equal(isTripPast({ end_date: 'not-a-date' }), false);
});
