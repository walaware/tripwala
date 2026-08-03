// isTripPast — the trigger for the post-trip space.
//
// Run: `pnpm test`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTripPast } from './tripStatus.js';

const iso = (/** @type {Date} */ d) => d.toISOString().slice(0, 10);
const daysFromNow = (/** @type {number} */ n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
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
