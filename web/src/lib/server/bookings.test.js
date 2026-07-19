// Unit tests for the booking shaping + the two reminder classifiers (#4). Pure
// functions, no PocketBase. Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeBooking, shapeBookings, isPending, isRecoupable } from './bookings.js';

const raw = (over = {}) => ({
  id: 'b1',
  trip: 't1',
  type: 'flight',
  title: 'SFO→NRT',
  status: 'booked',
  refundable: 'refundable',
  refund_deadline: '2026-06-01 00:00:00.000Z',
  start_date: '2026-06-10 00:00:00.000Z',
  end_date: '',
  cost: 850,
  currency: 'USD',
  ...over
});

test('shapeBooking: dates truncate to YYYY-MM-DD and unknown enums normalize', () => {
  const b = shapeBooking(raw({ type: 'weird', status: 'bogus', refundable: 'maybe', cost: '' }));
  assert.equal(b.type, 'other');
  assert.equal(b.status, 'planning');
  assert.equal(b.refundable, 'unknown');
  assert.equal(b.start_date, '2026-06-10');
  assert.equal(b.refund_deadline, '2026-06-01');
  assert.equal(b.cost, null);
});

test('shapeBookings: dated first, chronological, undated trail by title', () => {
  const out = shapeBookings([
    raw({ id: 'c', title: 'Zzz', start_date: '' }),
    raw({ id: 'a', start_date: '2026-06-01 00:00:00.000Z' }),
    raw({ id: 'b', start_date: '2026-06-05 00:00:00.000Z' }),
    raw({ id: 'd', title: 'Aaa', start_date: '' })
  ]);
  assert.deepEqual(out.map((b) => b.id), ['a', 'b', 'd', 'c']);
});

test('isPending: only planning counts', () => {
  assert.equal(isPending(shapeBooking(raw({ status: 'planning' }))), true);
  assert.equal(isPending(shapeBooking(raw({ status: 'booked' }))), false);
  assert.equal(isPending(shapeBooking(raw({ status: 'confirmed' }))), false);
});

test('isRecoupable: refundable + firm status + future/absent deadline', () => {
  const today = '2026-05-15';
  // Refundable, booked, deadline in the future → yes.
  assert.equal(isRecoupable(shapeBooking(raw({ refund_deadline: '2026-06-01 00:00:00.000Z' })), today), true);
  // Deadline today → still yes (inclusive).
  assert.equal(isRecoupable(shapeBooking(raw({ refund_deadline: '2026-05-15 00:00:00.000Z' })), today), true);
  // Deadline passed → no.
  assert.equal(isRecoupable(shapeBooking(raw({ refund_deadline: '2026-05-01 00:00:00.000Z' })), today), false);
  // Refundable, no deadline → treated as still recoupable.
  assert.equal(isRecoupable(shapeBooking(raw({ refund_deadline: '' })), today), true);
  // Non-refundable → never.
  assert.equal(isRecoupable(shapeBooking(raw({ refundable: 'nonrefundable' })), today), false);
  // Still just planning → nothing paid to recoup yet.
  assert.equal(isRecoupable(shapeBooking(raw({ status: 'planning' })), today), false);
});
