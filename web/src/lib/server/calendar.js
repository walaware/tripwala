// Friends-on-your-calendar (#30, Surface B). A trip shared beyond 'private' may
// be seen — as a read-only TEASER — by the accepted friends of any of its
// members. This is the ONLY read path that crosses the trip boundary, so the
// projection is deliberately thin and tier-dependent:
//
//   friends → name, dates, location, and which of your friends are on it.
//   busy    → dates and which friends are away. Name and location are BLANKED
//             here, at the source, so they cannot leak through a caller that
//             forgets to check the flag.
//
// It NEVER returns share_token or any member-only field, so it cannot become a
// link into the private detail route (which still gates on membership).
// Everything is live-computed, so unfriending or flipping a trip back to
// 'private' revokes the teaser immediately.

import { avatarUrl } from './userAvatar.js';
import { displayName } from '../displayName.js';
import { friendIdSet } from './friends.js';
import { tripVisibility } from '../visibility.js';

/** YYYY-MM-DD in UTC (matches trip date storage/comparison). */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}
const dateOnly = (/** @type {string | undefined | null} */ d) => String(d ?? '').slice(0, 10);

/**
 * @typedef {Object} FriendTeaser
 * @property {string} id synthetic display id (trip id) — NOT a link target
 * @property {string} name '' when busy
 * @property {string} start_date
 * @property {string} end_date
 * @property {string} location '' when busy
 * @property {boolean} busy dates-only tier — render as an anonymous band
 * @property {Array<{ name: string, avatar?: string }>} friends which of my friends are on it
 */

/**
 * Teasers of friends' trips that are shared (busy or friends) and haven't ended.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @returns {Promise<FriendTeaser[]>}
 */
export async function loadFriendsCalendar(pb, userId) {
  if (!userId) return [];
  const friendIds = [...(await friendIdSet(pb, userId))];
  if (!friendIds.length) return [];

  const orFilter = (/** @type {string} */ field, /** @type {string[]} */ ids) =>
    pb.filter(
      ids.map((_, i) => `${field} = {:p${i}}`).join(' || '),
      Object.fromEntries(ids.map((id, i) => [`p${i}`, id]))
    );

  // Memberships of my friends → the trips they're on, plus who they are.
  const memberships = await pb
    .collection('participants')
    .getFullList({ filter: orFilter('user', friendIds), expand: 'user' });
  if (!memberships.length) return [];

  const tripIds = [...new Set(memberships.map((m) => m.trip))];
  const trips = await pb.collection('trips').getFullList({ filter: orFilter('id', tripIds) });

  const today = todayUtc();
  /** @type {Map<string, any>} */
  const byId = new Map();
  for (const t of trips) {
    // Only shared trips, and drop ideas + already-ended trips. Anything that
    // isn't a known tier reads as private.
    const tier = tripVisibility(t);
    if (tier === 'private') continue;
    if (t.status === 'idea') continue;
    const end = dateOnly(t.end_date) || dateOnly(t.start_date);
    if (end && end < today) continue;
    const busy = tier === 'busy';
    byId.set(t.id, {
      id: t.id,
      // Blanked at the source for 'busy' — a caller that ignores `busy` still
      // cannot render what it never received.
      name: busy ? '' : t.name,
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      location: busy ? '' : (t.location ?? ''),
      busy,
      friends: []
    });
  }
  if (!byId.size) return [];

  // Attach which of my friends are on each visible trip (dedup per trip).
  /** @type {Map<string, Set<string>>} */
  const seen = new Map();
  for (const m of memberships) {
    const teaser = byId.get(m.trip);
    const u = m.expand?.user;
    if (!teaser || !u) continue;
    let set = seen.get(m.trip);
    if (!set) {
      set = new Set();
      seen.set(m.trip, set);
    }
    if (set.has(u.id)) continue;
    set.add(u.id);
    teaser.friends.push({ name: displayName(u.name || '', u), avatar: avatarUrl(u) });
  }

  return [...byId.values()].sort((a, b) =>
    dateOnly(a.start_date) < dateOnly(b.start_date) ? -1 : dateOnly(a.start_date) > dateOnly(b.start_date) ? 1 : 0
  );
}
