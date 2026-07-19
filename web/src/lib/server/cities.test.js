// Unit tests for city-segment shaping and date→city derivation (#3). Pure
// functions, no PocketBase. Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeCities, cityForDate } from './cities.js';

/**
 * @param {string} id @param {string} name @param {string} [start] @param {string} [end] @param {number} [sort]
 */
const row = (id, name, start = '', end = '', sort = 0) => ({
  id,
  name,
  start_date: start ? `${start} 00:00:00.000Z` : '',
  end_date: end ? `${end} 00:00:00.000Z` : '',
  sort_order: sort
});

test('shapeCities: dated cities sort chronologically, undated trail by sort_order', () => {
  const out = shapeCities([
    row('b', 'Kyoto', '2026-06-04', '2026-06-07'),
    row('c', 'Someday', '', '', 5),
    row('a', 'Tokyo', '2026-06-01', '2026-06-04'),
    row('d', 'Maybe', '', '', 2)
  ]);
  assert.deepEqual(
    out.map((c) => c.id),
    ['a', 'b', 'd', 'c']
  );
  assert.equal(out[0].start_date, '2026-06-01');
  assert.equal(out[0].end_date, '2026-06-04');
});

test('cityForDate: a date inside a range maps to that city', () => {
  const cities = shapeCities([
    row('a', 'Tokyo', '2026-06-01', '2026-06-04'),
    row('b', 'Kyoto', '2026-06-04', '2026-06-07')
  ]);
  assert.equal(cityForDate(cities, '2026-06-02'), 'a');
  // On an overlap boundary the later city wins (last match), so 06-04 → Kyoto.
  assert.equal(cityForDate(cities, '2026-06-04'), 'b');
  assert.equal(cityForDate(cities, '2026-06-06'), 'b');
});

test('cityForDate: dates outside every range, and undated cities, map to null', () => {
  const cities = shapeCities([
    row('a', 'Tokyo', '2026-06-01', '2026-06-04'),
    row('c', 'Someday', '', '')
  ]);
  assert.equal(cityForDate(cities, '2026-05-30'), null);
  assert.equal(cityForDate(cities, '2026-06-10'), null);
  assert.equal(cityForDate(cities, ''), null);
});

test('cityForDate: an open-ended city (no end date) covers everything from its start', () => {
  const cities = shapeCities([row('a', 'Basecamp', '2026-06-01', '')]);
  assert.equal(cityForDate(cities, '2026-06-01'), 'a');
  assert.equal(cityForDate(cities, '2027-01-01'), 'a');
  assert.equal(cityForDate(cities, '2026-05-31'), null);
});
