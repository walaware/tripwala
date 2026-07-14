// Unit tests for the notification feed logic that doesn't need a real
// PocketBase: the (user, type, ref) upsert in raise(), resolve() dismissing the
// matching row, and the read counters. A tiny in-memory fake stands in for the
// `notifications` collection. Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  raise,
  resolve,
  unreadCount,
  markRead,
  markAllRead
} from './notifications.js';

/**
 * Minimal fake pb for the `notifications` collection: pb.filter passes params
 * through, and the store enforces the unique (user, type, ref) index so raise()
 * exercises its upsert path.
 * @returns {any}
 */
function fakePb() {
  /** @type {any[]} */
  const rows = [];
  let seq = 0;
  // Literal boolean clauses (`dismissed = false`) live in the template string,
  // not the params — so carry the template through and honour them in match().
  /** @param {any} r @param {any} f */
  const match = (r, f) => {
    const tpl = f._tpl ?? '';
    if (tpl.includes('dismissed = false') && r.dismissed) return false;
    if (tpl.includes('read = false') && r.read) return false;
    return (
      (f.u == null || r.user === f.u) &&
      (f.t == null || r.type === f.t) &&
      (f.r == null || r.ref === f.r)
    );
  };
  return {
    filter: (/** @type {string} */ _tpl, /** @type {any} */ params) => ({ _tpl, ...params }),
    collection() {
      return {
        /** @param {number} _p @param {number} _n @param {any} opts */
        getList: async (_p, _n, opts) => {
          const f = opts?.filter ?? {};
          const items = rows.filter((r) => match(r, f));
          return { items, totalItems: items.length };
        },
        /** @param {any} opts */
        getFullList: async (opts) => rows.filter((r) => match(r, opts?.filter ?? {})),
        /** @param {any} f */
        getFirstListItem: async (f) => {
          const row = rows.find((r) => match(r, f));
          if (!row) throw new Error('not found');
          return row;
        },
        /** @param {string} id */
        getOne: async (id) => {
          const row = rows.find((r) => r.id === id);
          if (!row) throw new Error('not found');
          return row;
        },
        /** @param {any} data */
        create: async (data) => {
          if (rows.some((r) => r.user === data.user && r.type === data.type && r.ref === data.ref)) {
            throw new Error('unique constraint');
          }
          const row = { id: `n${++seq}`, ...data };
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

test('raise creates one row per (user, type, ref)', async () => {
  const pb = fakePb();
  await raise(pb, { user: 'u1', type: 'friend_request', actor: 'u2', ref: 'f1' });
  assert.equal(pb._rows.length, 1);
  assert.equal(pb._rows[0].read, false);
  assert.equal(pb._rows[0].dismissed, false);
});

test('re-raising the same event upserts (no duplicate) and un-reads/un-dismisses', async () => {
  const pb = fakePb();
  await raise(pb, { user: 'u1', type: 'trip_invitation', actor: 'u2', trip: 't1', ref: 'i1' });
  // Simulate the user having read + the row later dismissed.
  Object.assign(pb._rows[0], { read: true, dismissed: true });
  await raise(pb, { user: 'u1', type: 'trip_invitation', actor: 'u3', trip: 't1', ref: 'i1' });
  assert.equal(pb._rows.length, 1);
  assert.equal(pb._rows[0].read, false);
  assert.equal(pb._rows[0].dismissed, false);
  assert.equal(pb._rows[0].actor, 'u3'); // refreshed to the latest inviter
});

test('resolve dismisses the matching row so it drops out of the feed', async () => {
  const pb = fakePb();
  await raise(pb, { user: 'u1', type: 'friend_request', actor: 'u2', ref: 'f1' });
  await resolve(pb, { user: 'u1', type: 'friend_request', ref: 'f1' });
  assert.equal(pb._rows[0].dismissed, true);
});

test('resolve is a no-op when nothing matches', async () => {
  const pb = fakePb();
  await resolve(pb, { user: 'u1', type: 'friend_request', ref: 'nope' });
  assert.equal(pb._rows.length, 0);
});

test('unreadCount counts only live, unread items', async () => {
  const pb = fakePb();
  await raise(pb, { user: 'u1', type: 'friend_request', actor: 'u2', ref: 'f1' });
  await raise(pb, { user: 'u1', type: 'friend_request', actor: 'u3', ref: 'f2' });
  assert.equal(await unreadCount(pb, 'u1'), 2);
  await markRead(pb, 'u1', pb._rows[0].id);
  assert.equal(await unreadCount(pb, 'u1'), 1);
  await resolve(pb, { user: 'u1', type: 'friend_request', ref: 'f2' });
  assert.equal(await unreadCount(pb, 'u1'), 0);
});

test('markRead rejects a notification that is not mine', async () => {
  const pb = fakePb();
  await raise(pb, { user: 'u1', type: 'friend_request', actor: 'u2', ref: 'f1' });
  await assert.rejects(() => markRead(pb, 'someone-else', pb._rows[0].id), /Not your notification/);
});

test('markAllRead flips every live unread item for the user', async () => {
  const pb = fakePb();
  await raise(pb, { user: 'u1', type: 'friend_request', actor: 'u2', ref: 'f1' });
  await raise(pb, { user: 'u1', type: 'trip_invitation', actor: 'u3', trip: 't1', ref: 'i1' });
  await markAllRead(pb, 'u1');
  assert.equal(await unreadCount(pb, 'u1'), 0);
  assert.ok(pb._rows.every((/** @type {any} */ r) => r.read === true));
});
