// Per-trip authorization — the single source of truth for "may this user do this
// on this trip?". Extracted from [share_token]/actions/+server.js so BOTH the
// interactive UI actions AND the personal-key API (/api/x/v1/*) enforce the exact
// same rules: a personal key is a headless session as its owner and can never
// exceed what that user could do in the UI (walaware API Access, "Personal keys").
//
// The rules, verbatim from the UI:
//   * you must be a MEMBER of the trip to change anything          → 403
//   * a `pending` (unapproved) link-join can't act yet             → 403
//   * any member may act on THEMSELVES; only an ORGANIZER may act
//     on another person, edit the trip, or manage shared config    → 403
//   * every target row must belong to THIS trip                    → 403
//
// Error strings here are byte-identical to the originals in actions/+server.js, so
// moving the checks changes no UI behavior (the API reuses the same messages).

import { error } from '@sveltejs/kit';
import { getMembership } from './membership.js';

/**
 * Resolve a trip from its public share slug, or 404. Mirrors the actions endpoint.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} shareToken
 * @returns {Promise<any>}
 */
export async function loadTripByShareToken(pb, shareToken) {
  try {
    return await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: shareToken }));
  } catch (/** @type {any} */ _e) {
    throw error(404, 'Trip not found');
  }
}

/**
 * Resolve a trip by id, or 404. Used by the API where the id is in the path.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function loadTripById(pb, id) {
  try {
    return await pb.collection('trips').getOne(id);
  } catch (/** @type {any} */ _e) {
    throw error(404, 'Trip not found');
  }
}

/**
 * The acting user's ACTIVE membership on a trip, plus their organizer flag.
 * Throws the same 403s the UI gives a non-member or a still-pending join.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ id: string }} trip
 * @param {string | null | undefined} userId
 * @returns {Promise<{ me: any, isOrganizer: boolean }>}
 */
export async function requireActiveMembership(pb, trip, userId) {
  const me = /** @type {any} */ (await getMembership(pb, trip.id, userId));
  if (!me) throw error(403, 'Join this trip before making changes');
  // A pending (unapproved) link-join can't see or act on the trip yet.
  if (me.status === 'pending') throw error(403, 'Your request to join is awaiting approval');
  return { me, isOrganizer: me.role === 'organizer' };
}

/**
 * Guard an organizer-only action. Message defaults to the UI's wording for acting
 * on another person; callers pass the specific message where the UI differs.
 *
 * @param {boolean} isOrganizer
 * @param {string} [message]
 */
export function assertOrganizer(isOrganizer, message = 'Only organizers can change other people') {
  if (!isOrganizer) throw error(403, message);
}

/**
 * Fetch a row and assert it belongs to THIS trip (via its `trip` field), or 403.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ id: string }} trip
 * @param {string} coll
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function assertInTrip(pb, trip, coll, id) {
  const rec = await pb.collection(coll).getOne(id);
  if (rec.trip !== trip.id) throw error(403, 'That item is not part of this trip');
  return rec;
}
