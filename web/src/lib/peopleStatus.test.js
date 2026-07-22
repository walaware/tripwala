// Unit tests for the shared people-status vocabulary — the thing that makes
// "going / maybe / can't / no answer / invited" mean one consistent set of
// buckets on both the Who's-in card and the People page. Pure functions, no
// PocketBase needed. Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, STATUS_ORDER, statusOf, countByStatus, summarise } from './peopleStatus.js';

test('statusOf: an unanswered participant is no_answer, not "out"', () => {
  // The whole point: silence used to be indistinguishable from a decline.
  assert.equal(statusOf({ rsvp_status: null }).key, 'no_answer');
  assert.equal(statusOf({ rsvp_status: '' }).key, 'no_answer');
  assert.equal(statusOf({}).key, 'no_answer');
  assert.equal(statusOf(null).key, 'no_answer');
});

test('statusOf: each RSVP answer maps to its own bucket', () => {
  assert.equal(statusOf({ rsvp_status: 'going' }).key, 'going');
  assert.equal(statusOf({ rsvp_status: 'maybe' }).key, 'maybe');
  assert.equal(statusOf({ rsvp_status: 'out' }).key, 'out');
});

test('statusOf: an unknown value degrades to no_answer rather than throwing', () => {
  assert.equal(statusOf({ rsvp_status: 'banana' }).key, 'no_answer');
});

test('countByStatus: counts every bucket, including the silent ones', () => {
  const crew = [
    { rsvp_status: 'going' },
    { rsvp_status: 'going' },
    { rsvp_status: 'maybe' },
    { rsvp_status: 'out' },
    { rsvp_status: null }
  ];
  assert.deepEqual(countByStatus(crew), {
    going: 2,
    maybe: 1,
    out: 1,
    no_answer: 1,
    invited: 0
  });
});

test('countByStatus: invited comes from the invite lists, not from participants', () => {
  // Invited people have no participant row at all — that is exactly why they
  // were invisible before.
  const counts = countByStatus([{ rsvp_status: 'going' }], 3);
  assert.equal(counts.invited, 3);
  assert.equal(counts.going, 1);
});

test('countByStatus: an empty trip is all zeroes', () => {
  assert.deepEqual(countByStatus([]), {
    going: 0,
    maybe: 0,
    out: 0,
    no_answer: 0,
    invited: 0
  });
});

test('summarise: drops empty buckets so the chip line stays short', () => {
  const out = summarise(countByStatus([{ rsvp_status: 'going' }], 2));
  assert.deepEqual(
    out.map((s) => [s.key, s.count]),
    [
      ['going', 1],
      ['invited', 2]
    ]
  );
});

test('summarise: keeps the declared order, most-committed first', () => {
  const counts = countByStatus(
    [{ rsvp_status: 'out' }, { rsvp_status: 'maybe' }, { rsvp_status: 'going' }, {}],
    1
  );
  assert.deepEqual(
    summarise(counts).map((s) => s.key),
    ['going', 'maybe', 'out', 'no_answer', 'invited']
  );
});

test('summarise: nothing to say about an empty trip', () => {
  assert.deepEqual(summarise(countByStatus([])), []);
});

test('every status in STATUS_ORDER has metadata, and vice versa', () => {
  for (const key of STATUS_ORDER) {
    assert.ok(STATUS[key], `${key} is ordered but has no metadata`);
    assert.equal(STATUS[key].key, key);
    assert.ok(STATUS[key].label, `${key} needs a human label`);
    assert.ok(STATUS[key].emoji, `${key} needs a badge glyph`);
  }
  assert.deepEqual(Object.keys(STATUS).sort(), [...STATUS_ORDER].sort());
});

test('status tones are all valid @walaware/design Chip tones', () => {
  const TONES = ['neutral', 'coral', 'sun', 'berry', 'leaf', 'danger'];
  for (const key of STATUS_ORDER) {
    assert.ok(TONES.includes(STATUS[key].tone), `${key} has tone "${STATUS[key].tone}"`);
  }
});
