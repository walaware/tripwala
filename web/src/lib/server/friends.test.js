// Unit tests for the friend-graph logic that doesn't need a real PocketBase:
// the ordered-pair canonicalization and the request/auto-accept reconciliation.
// A tiny in-memory fake stands in for the `friendships` collection. Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderPair, sendFriendRequest, getFriendship } from './friends.js';

/**
 * Minimal fake pb supporting exactly what getFriendship/sendFriendRequest use:
 * pb.filter(tpl, params) → params (carried through), and a `friendships`
 * collection matched on the (user_low, user_high) pair.
 */
/** @returns {any} */
function fakePb() {
  /** @type {any[]} */
  const rows = [];
  let seq = 0;
  return {
    /** @param {string} _tpl @param {any} params */
    filter: (_tpl, params) => params,
    collection() {
      return {
        /** @param {number} _p @param {number} _n @param {any} opts */
        getList: async (_p, _n, opts) => {
          const f = opts?.filter ?? {};
          const items = rows.filter(
            (r) => (f.lo == null || r.user_low === f.lo) && (f.hi == null || r.user_high === f.hi)
          );
          return { items: items.slice(0, 1) };
        },
        /** @param {string} id */
        getOne: async (id) => rows.find((r) => r.id === id),
        /** @param {any} data */
        create: async (data) => {
          // Emulate the unique (user_low, user_high) index.
          if (rows.some((r) => r.user_low === data.user_low && r.user_high === data.user_high)) {
            throw new Error('unique constraint');
          }
          const row = { id: `f${++seq}`, ...data };
          rows.push(row);
          return row;
        },
        /** @param {string} id @param {any} data */
        update: async (id, data) => {
          const row = rows.find((r) => r.id === id);
          Object.assign(row, data);
          return row;
        }
      };
    },
    _rows: rows
  };
}

test('orderPair sorts ids so the pair is direction-agnostic', () => {
  assert.deepEqual(orderPair('a', 'b'), { user_low: 'a', user_high: 'b' });
  assert.deepEqual(orderPair('b', 'a'), { user_low: 'a', user_high: 'b' });
  const ab = orderPair('u_zzz', 'u_aaa');
  const ba = orderPair('u_aaa', 'u_zzz');
  assert.deepEqual(ab, ba);
});

test('a request to yourself is rejected', async () => {
  const pb = fakePb();
  assert.deepEqual(await sendFriendRequest(pb, 'u1', 'u1'), { status: 'self' });
  assert.equal(pb._rows.length, 0);
});

test('first request creates a single pending row', async () => {
  const pb = fakePb();
  const res = await sendFriendRequest(pb, 'u1', 'u2');
  assert.equal(res.status, 'pending');
  assert.equal(pb._rows.length, 1);
  assert.equal(pb._rows[0].status, 'pending');
  assert.equal(pb._rows[0].requested_by, 'u1');
});

test('re-sending my own pending request is a no-op (no duplicate)', async () => {
  const pb = fakePb();
  await sendFriendRequest(pb, 'u1', 'u2');
  const res = await sendFriendRequest(pb, 'u1', 'u2');
  assert.equal(res.status, 'pending');
  assert.equal(pb._rows.length, 1);
});

test('the reverse request auto-accepts the existing pending one', async () => {
  const pb = fakePb();
  await sendFriendRequest(pb, 'u1', 'u2'); // u1 → u2 pending
  const res = await sendFriendRequest(pb, 'u2', 'u1'); // u2 → u1
  assert.equal(res.status, 'accepted');
  assert.equal(pb._rows.length, 1); // still one row (same canonical pair)
  assert.equal(pb._rows[0].status, 'accepted');
});

test('requesting an already-accepted friend is a no-op accepted', async () => {
  const pb = fakePb();
  await sendFriendRequest(pb, 'u1', 'u2');
  await sendFriendRequest(pb, 'u2', 'u1'); // now accepted
  const res = await sendFriendRequest(pb, 'u1', 'u2');
  assert.equal(res.status, 'accepted');
  assert.equal(pb._rows.length, 1);
});

test('getFriendship finds the row regardless of argument order', async () => {
  const pb = fakePb();
  await sendFriendRequest(pb, 'u2', 'u9');
  const a = await getFriendship(pb, 'u9', 'u2');
  const b = await getFriendship(pb, 'u2', 'u9');
  assert.ok(a && b);
  assert.equal(a.id, b.id);
});
