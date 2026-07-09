// Unit tests for the days <-> ranges seam that lets the planning calendar
// speak in stretches while `participants.available_dates` keeps storing days.
// Run with `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandRange, groupDays, toggleRange } from './dateRanges.js';

test('expandRange covers both endpoints', () => {
  assert.deepEqual(expandRange('2026-07-03', '2026-07-06'), [
    '2026-07-03',
    '2026-07-04',
    '2026-07-05',
    '2026-07-06'
  ]);
});

test('expandRange treats a missing end as a single day', () => {
  assert.deepEqual(expandRange('2026-07-03', ''), ['2026-07-03']);
});

test('expandRange crosses month and year boundaries', () => {
  assert.deepEqual(expandRange('2026-12-30', '2027-01-02'), [
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02'
  ]);
});

test('expandRange rejects a backwards range', () => {
  assert.deepEqual(expandRange('2026-07-06', '2026-07-03'), []);
});

test('groupDays merges consecutive days and splits on gaps', () => {
  const days = ['2026-07-04', '2026-07-03', '2026-07-05', '2026-07-09', '2026-07-10'];
  assert.deepEqual(groupDays(days), [
    { start: '2026-07-03', end: '2026-07-05' },
    { start: '2026-07-09', end: '2026-07-10' }
  ]);
});

test('groupDays merges across a month boundary', () => {
  assert.deepEqual(groupDays(['2026-07-31', '2026-08-01']), [
    { start: '2026-07-31', end: '2026-08-01' }
  ]);
});

test('groupDays ignores duplicates and returns [] for nothing', () => {
  assert.deepEqual(groupDays(['2026-07-03', '2026-07-03']), [
    { start: '2026-07-03', end: '2026-07-03' }
  ]);
  assert.deepEqual(groupDays([]), []);
});

test('groupDays and expandRange round-trip', () => {
  const days = ['2026-07-03', '2026-07-04', '2026-07-05'];
  const [range] = groupDays(days);
  assert.deepEqual(expandRange(range.start, range.end), days);
});

test('toggleRange adds a range that is not yet present', () => {
  assert.deepEqual(toggleRange(['2026-07-01'], '2026-07-03', '2026-07-04'), [
    '2026-07-01',
    '2026-07-03',
    '2026-07-04'
  ]);
});

test('toggleRange clears a range that is fully present', () => {
  const days = ['2026-07-01', '2026-07-03', '2026-07-04'];
  assert.deepEqual(toggleRange(days, '2026-07-03', '2026-07-04'), ['2026-07-01']);
});

test('toggleRange fills in a partially present range rather than clearing it', () => {
  // Only the 4th is free; dragging the 3rd–5th means "all three", not "drop the 4th".
  assert.deepEqual(toggleRange(['2026-07-04'], '2026-07-03', '2026-07-05'), [
    '2026-07-03',
    '2026-07-04',
    '2026-07-05'
  ]);
});

test('toggleRange never mutates the input', () => {
  const days = ['2026-07-03'];
  toggleRange(days, '2026-07-03', '2026-07-03');
  assert.deepEqual(days, ['2026-07-03']);
});
