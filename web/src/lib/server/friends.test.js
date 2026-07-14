// Unit tests for the friend-graph logic that doesn't need a real PocketBase:
// the ordered-pair canonicalization and the request/auto-accept reconciliation.
// A tiny in-memory fake stands in for the `friendships` collection. Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderPair, sendFriendRequest, getFriendship } from './friends.js';

/**
 * Minimal fake pb. Collection-aware: each collection name gets its own row store,
 * so the `notifications` writes that sendFriendRequest now fires (raise/resolve)
 * land in a separate bucket and don't inflate the `friendships` count the tests
 * assert on. `_rows` still points at the friendships store for convenience.
 */
/** @returns {any} */
function fakePb() {
  /** @type {Record<string, any[]>} */
  const stores = {};
  /** @param {string} name */
  const store = (name) => (stores[name] ??= []);
  let seq = 0;
  return {
    /** @param {string} _tpl @param {any} params */
    filter: (_tpl, params) => params,
    /** @param {string} name */
    collection(name) {
      const rows = store(name);
      return {
        /** @param {number} _p @param {number} _n @param {any} opts */
        getList: async (_p, _n, opts) => {
          const f = opts?.filter ?? {};
          const items = rows.filter(
            (r) => (f.lo == null || r.user_low === f.lo) && (f.hi == null || r.user_high === f.hi)
          );
          return { items: items.slice(0, 1) };
        },
        /** @param {any} f */
        getFirstListItem: async (f) => {
          const row = rows.find(
            (r) =>
              (f.u == null || r.user === f.u) &&
              (f.t == null || r.type === f.t) &&
              (f.r == null || r.ref === f.r)
          );
          if (!row) throw new Error('not found');
          return row;
        },
        /** @param {string} id */
        getOne: async (id) => rows.find((r) => r.id === id),
        /** @param {any} data */
        create: async (data) => {
          // Emulate the unique (user_low, user_high) index (friendships only).
          if (
            data.user_low != null &&
            rows.some((r) => r.user_low === data.user_low && r.user_high === data.user_high)
          ) {
            throw new Error('unique constraint');
          }
          const row = { id: `${name[0]}${++seq}`, ...data };
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
    get _rows() {
      return store('friendships');
    }
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
