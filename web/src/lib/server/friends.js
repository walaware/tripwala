// The friend graph (#30). A friendship is a single row in the `friendships`
// collection keyed by an ORDERED pair of user ids (user_low < user_high), so a
// request in either direction maps to the same row — the DB unique index makes
// "one friendship per pair" an invariant and lets a reverse request auto-accept.
//
// Like the rest of tripwala, every read/write here goes through the superuser
// client server-side and is scoped to the signed-in user's id (never trusted
// from the client). This module is the single writer of friendships, so the
// low<high ordering invariant is enforced in one place (orderPair).

import { randomBytes } from 'node:crypto';
import { avatarUrl } from './userAvatar.js';
import { displayName } from '../displayName.js';
import { raise, resolve } from './notifications.js';

/**
 * Canonicalize a pair of user ids into { user_low, user_high } with low < high.
 * @param {string} a
 * @param {string} b
 */
export function orderPair(a, b) {
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a };
}

/** Shape a users record into the lightweight person the UI needs. */
function person(/** @type {any} */ u) {
  if (!u) return null;
  return { id: u.id, name: displayName(u.name || '', u), avatar: avatarUrl(u) };
}

/**
 * The friendship row for a pair, or null. Optionally expands both users.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 * @param {string} otherId
 * @param {boolean} [expand]
 */
export async function getFriendship(pb, meId, otherId, expand = false) {
  if (!meId || !otherId || meId === otherId) return null;
  const { user_low, user_high } = orderPair(meId, otherId);
  const res = await pb.collection('friendships').getList(1, 1, {
    filter: pb.filter('user_low = {:lo} && user_high = {:hi}', { lo: user_low, hi: user_high }),
    ...(expand ? { expand: 'user_low,user_high' } : {})
  });
  return res.items[0] ?? null;
}

/**
 * True iff the two users are accepted friends.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 * @param {string} otherId
 */
export async function areFriends(pb, meId, otherId) {
  const f = await getFriendship(pb, meId, otherId);
  return f?.status === 'accepted';
}

/**
 * Send a friend request from me to `otherId`.
 * - self → rejected.
 * - already accepted, or already my own pending request → no-op (returns it).
 * - a reverse pending request already exists → auto-accept (mutual intent).
 * - otherwise → create a pending request.
 * Returns { status: 'accepted' | 'pending' | 'self' }.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 * @param {string} otherId
 */
export async function sendFriendRequest(pb, meId, otherId) {
  if (!meId || !otherId || meId === otherId) return { status: 'self' };

  const existing = await getFriendship(pb, meId, otherId);
  if (existing) {
    if (existing.status === 'accepted') return { status: 'accepted' };
    // pending: mine → leave it; theirs → both sides asked, so accept.
    if (existing.requested_by === meId) return { status: 'pending' };
    await pb.collection('friendships').update(existing.id, { status: 'accepted' });
    // Both sides asked: the request that was waiting on me is now settled.
    await resolve(pb, { user: meId, type: 'friend_request', ref: existing.id });
    return { status: 'accepted' };
  }

  const { user_low, user_high } = orderPair(meId, otherId);
  try {
    const row = await pb
      .collection('friendships')
      .create({ user_low, user_high, requested_by: meId, status: 'pending' });
    // Notify the addressee that a request is waiting for them.
    await raise(pb, { user: otherId, type: 'friend_request', actor: meId, ref: row.id });
    return { status: 'pending' };
  } catch (_) {
    // Lost a race on the unique pair index — re-read and reconcile.
    const now = await getFriendship(pb, meId, otherId);
    if (now?.status === 'accepted') return { status: 'accepted' };
    if (now && now.requested_by !== meId) {
      await pb.collection('friendships').update(now.id, { status: 'accepted' });
      await resolve(pb, { user: meId, type: 'friend_request', ref: now.id });
      return { status: 'accepted' };
    }
    return { status: 'pending' };
  }
}

/**
 * Accept a pending request addressed to me. Only the side that did NOT initiate
 * may accept, and only if I'm part of the pair.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 * @param {string} rowId
 */
export async function acceptFriendRequest(pb, meId, rowId) {
  const row = await pb.collection('friendships').getOne(rowId);
  const inPair = row.user_low === meId || row.user_high === meId;
  if (!inPair) throw new Error('Not your request');
  if (row.status === 'accepted') return row;
  if (row.requested_by === meId) throw new Error('You cannot accept your own request');
  const updated = await pb.collection('friendships').update(rowId, { status: 'accepted' });
  await resolve(pb, { user: meId, type: 'friend_request', ref: rowId });
  return updated;
}

/**
 * Decline an incoming request, cancel one I sent, or remove the edge entirely —
 * all the same operation: delete the row (only if I'm part of the pair).
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 * @param {string} rowId
 */
export async function removeFriendship(pb, meId, rowId) {
  const row = await pb.collection('friendships').getOne(rowId);
  if (row.user_low !== meId && row.user_high !== meId) throw new Error('Not your friendship');
  await pb.collection('friendships').delete(rowId);
  // The pending request's notification always belongs to the addressee (the side
  // that didn't initiate) — clear it whether this is a decline or a cancel.
  const addressee = row.requested_by === row.user_low ? row.user_high : row.user_low;
  await resolve(pb, { user: addressee, type: 'friend_request', ref: rowId });
}

/**
 * Unfriend by the other user's id (finds the row first).
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 * @param {string} otherId
 */
export async function unfriend(pb, meId, otherId) {
  const row = await getFriendship(pb, meId, otherId);
  if (row) await pb.collection('friendships').delete(row.id);
}

/**
 * The "other" user in a row relative to me (from an expanded row).
 * @param {any} row
 * @param {string} meId
 */
function otherUser(row, meId) {
  const lowIsMe = row.user_low === meId;
  return row.expand?.[lowIsMe ? 'user_high' : 'user_low'] ?? null;
}

/**
 * My accepted friends, as people. Sorted by name.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 */
export async function listFriends(pb, meId) {
  if (!meId) return [];
  const rows = await pb.collection('friendships').getFullList({
    filter: pb.filter('(user_low = {:m} || user_high = {:m}) && status = "accepted"', { m: meId }),
    expand: 'user_low,user_high'
  });
  /** @type {Array<{ id: string, name: string, avatar?: string }>} */
  const out = [];
  for (const r of rows) {
    const p = person(otherUser(r, meId));
    if (p) out.push(p);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Set of user ids I'm accepted-friends with (fast membership checks).
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 */
export async function friendIdSet(pb, meId) {
  const rows = await pb.collection('friendships').getFullList({
    filter: pb.filter('(user_low = {:m} || user_high = {:m}) && status = "accepted"', { m: meId })
  });
  const set = new Set();
  for (const r of rows) set.add(r.user_low === meId ? r.user_high : r.user_low);
  return set;
}

/**
 * Pending requests others sent ME (I can accept/decline). Each carries the row id
 * plus the requester as a person.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 */
export async function listIncomingRequests(pb, meId) {
  if (!meId) return [];
  const rows = await pb.collection('friendships').getFullList({
    filter: pb.filter(
      '(user_low = {:m} || user_high = {:m}) && status = "pending" && requested_by != {:m}',
      { m: meId }
    ),
    expand: 'user_low,user_high',
    sort: '-created'
  });
  /** @type {Array<{ id: string, from: { id: string, name: string, avatar?: string } }>} */
  const out = [];
  for (const r of rows) {
    const from = person(otherUser(r, meId));
    if (from) out.push({ id: r.id, from });
  }
  return out;
}

/**
 * Requests I sent that are still pending (I can cancel).
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 */
export async function listOutgoingRequests(pb, meId) {
  if (!meId) return [];
  const rows = await pb.collection('friendships').getFullList({
    filter: pb.filter(
      '(user_low = {:m} || user_high = {:m}) && status = "pending" && requested_by = {:m}',
      { m: meId }
    ),
    expand: 'user_low,user_high',
    sort: '-created'
  });
  /** @type {Array<{ id: string, to: { id: string, name: string, avatar?: string } }>} */
  const out = [];
  for (const r of rows) {
    const to = person(otherUser(r, meId));
    if (to) out.push({ id: r.id, to });
  }
  return out;
}

/**
 * Look up a user by email (case-insensitive). Server-only — the browser never
 * gets the directory. Callers must NOT reveal whether this matched (enumeration
 * oracle); return a neutral result to the client regardless.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} email
 */
export async function findUserByEmail(pb, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  try {
    const res = await pb
      .collection('users')
      .getList(1, 1, { filter: pb.filter('email = {:e}', { e }) });
    return res.items[0] ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * "People you've traveled with" — users who share a trip membership with me but
 * aren't already my friend or in a pending request with me. Suggestion source
 * for adding friends without an email search.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} meId
 */
export async function coTravelers(pb, meId) {
  if (!meId) return [];
  // Trips I'm a member of.
  const mine = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('user = {:m}', { m: meId }) });
  const tripIds = [...new Set(mine.map((p) => p.trip))];
  if (!tripIds.length) return [];

  const orFilter = pb.filter(
    tripIds.map((_, i) => `trip = {:t${i}}`).join(' || '),
    Object.fromEntries(tripIds.map((id, i) => [`t${i}`, id]))
  );
  const others = await pb
    .collection('participants')
    .getFullList({ filter: orFilter, expand: 'user' });

  // Exclude me, unlinked participants, existing friends, and pending edges.
  const excluded = await friendIdSet(pb, meId);
  excluded.add(meId);
  for (const r of await listIncomingRequests(pb, meId)) excluded.add(r.from.id);
  for (const r of await listOutgoingRequests(pb, meId)) excluded.add(r.to.id);

  /** @type {Map<string, any>} */
  const seen = new Map();
  for (const p of others) {
    const u = p.expand?.user;
    if (!u || excluded.has(u.id) || seen.has(u.id)) continue;
    seen.set(u.id, person(u));
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Return this user's shareable friend token, generating + persisting one on first
 * use. Collision-retries against the unique index.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 */
export async function ensureFriendToken(pb, userId) {
  const rec = await pb.collection('users').getOne(userId);
  if (rec.friend_token) return rec.friend_token;
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = randomBytes(9).toString('base64url'); // 12 chars, url-safe
    try {
      const updated = await pb.collection('users').update(userId, { friend_token: token });
      return updated.friend_token;
    } catch (_) {
      // unique collision (astronomically unlikely) or a concurrent set — re-read.
      const fresh = await pb.collection('users').getOne(userId);
      if (fresh.friend_token) return fresh.friend_token;
    }
  }
  throw new Error('Could not generate a friend link');
}

/**
 * Resolve a friend token to its owning user, or null.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} token
 */
export async function resolveFriendToken(pb, token) {
  const t = String(token || '').trim();
  if (!t) return null;
  try {
    const res = await pb
      .collection('users')
      .getList(1, 1, { filter: pb.filter('friend_token = {:t}', { t }) });
    return res.items[0] ?? null;
  } catch (_) {
    return null;
  }
}
