// "Someday" wishlist: the idea-stage trips a signed-in user belongs to. Unlike
// the dated dashboard (see dashboard.js), ideas have no dates and aren't bucketed
// — they get their own AppShell destination. Each card shows the title, an
// optional rough location, the co-organizer group, and a promote-to-trip action.

import { avatarUrl } from './userAvatar.js';
import { participantName } from '../displayName.js';

/**
 * @typedef {Object} IdeaTrip
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string} location
 * @property {string} role                     the viewer's role on this idea
 * @property {number} members
 * @property {Array<{ name: string, src?: string }>} people  co-organizers (viewer first)
 * @property {string} _created
 */

/**
 * Shape idea-stage trips into cards. Pure — all IO is done by the caller.
 *
 * @param {Array<any>} ideaTrips        trip records with status === 'idea'
 * @param {Array<any>} participants      participant rows (any trip), ideally expand:'user'
 * @param {Record<string, string>} roleByTrip  viewer's role per trip id
 * @param {string} userId               the viewer
 * @returns {IdeaTrip[]}  newest idea first
 */
export function shapeIdeas(ideaTrips, participants, roleByTrip, userId) {
  /** @type {Record<string, Array<{ name: string, src?: string, _me: boolean }>>} */
  const peopleByTrip = {};
  for (const p of participants) {
    (peopleByTrip[p.trip] ??= []).push({
      name: participantName(p),
      src: avatarUrl(p.expand?.user),
      _me: p.user === userId
    });
  }

  // Viewer leads the avatar group ("you, or you + 1"), then everyone else.
  /** @param {Array<{ name: string, src?: string, _me: boolean }>} people */
  const order = (people) =>
    people
      .slice()
      .sort((a, b) => Number(b._me) - Number(a._me))
      .map(({ name, src }) => ({ name, src }));

  return ideaTrips
    .map((t) => {
      const people = peopleByTrip[t.id] ?? [];
      return {
        id: t.id,
        name: t.name,
        slug: t.share_token,
        location: t.location ?? '',
        role: roleByTrip[t.id] ?? 'guest',
        members: people.length,
        people: order(people),
        _created: String(t.created ?? '')
      };
    })
    .sort((a, b) => (a._created > b._created ? -1 : a._created < b._created ? 1 : 0));
}

/**
 * Load every idea-stage trip the user belongs to. Mirrors loadUserTrips' two
 * filtered fetches, then keeps only status='idea' rows.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @returns {Promise<IdeaTrip[]>}
 */
export async function loadUserIdeas(pb, userId) {
  const memberships = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('user = {:u}', { u: userId }) });
  if (!memberships.length) return [];

  /** @type {Record<string, string>} role per trip id */
  const roleByTrip = {};
  for (const m of memberships) roleByTrip[m.trip] = m.role || 'guest';
  const ids = Object.keys(roleByTrip);

  const orFilter = (/** @type {string} */ field) =>
    pb.filter(
      ids.map((_, i) => `${field} = {:p${i}}`).join(' || '),
      Object.fromEntries(ids.map((id, i) => [`p${i}`, id]))
    );

  const [trips, participants] = await Promise.all([
    pb.collection('trips').getFullList({ filter: orFilter('id') }),
    pb.collection('participants').getFullList({ filter: orFilter('trip'), expand: 'user' })
  ]);

  const ideaTrips = trips.filter((t) => t.status === 'idea');
  return shapeIdeas(ideaTrips, participants, roleByTrip, userId);
}
