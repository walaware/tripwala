// Load every trip a signed-in user belongs to, bucketed by timing for the
// dashboard. Membership is a participant row linked to the user; we attach their
// role and a couple of headline counts per trip.

import { avatarUrl } from './userAvatar.js';
import { participantName } from '../displayName.js';

/**
 * @typedef {Object} DashTrip
 * @property {string} id
 * @property {string} name
 * @property {string} slug
 * @property {string} location
 * @property {string} start_date
 * @property {string} end_date
 * @property {string} role
 * @property {string} status
 * @property {string} trip_type
 * @property {number} members
 * @property {number} going
 * @property {number} maybe
 * @property {Array<{ name: string, avatar?: string }>} crew
 * @property {string} _start
 * @property {'current' | 'upcoming' | 'past'} _bucket
 */

/** @typedef {{ current: DashTrip[], upcoming: DashTrip[], past: DashTrip[] }} Dashboard */

/** YYYY-MM-DD in UTC (matches how trip dates are stored/compared). */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** @param {string | undefined | null} d a PB datetime, e.g. "2026-08-01 00:00:00.000Z" */
const dateOnly = (d) => String(d ?? '').slice(0, 10);

/**
 * @param {{ start: string, end: string }} t
 * @param {string} today
 * @returns {'current' | 'upcoming' | 'past'}
 */
function bucketOf(t, today) {
  const s = t.start;
  const e = t.end || t.start;
  if (!s) return 'upcoming'; // undated trips read as upcoming
  if (e < today) return 'past';
  if (s > today) return 'upcoming';
  return 'current';
}

/**
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 */
export async function loadUserTrips(pb, userId) {
  const memberships = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('user = {:u}', { u: userId }) });

  /** @type {Dashboard} */
  const empty = { current: [], upcoming: [], past: [] };
  if (!memberships.length) return empty;

  /** @type {Record<string, string>} role per trip id */
  const roleByTrip = {};
  for (const m of memberships) roleByTrip[m.trip] = m.role || 'guest';
  const ids = Object.keys(roleByTrip);

  // One filtered fetch each for trips and all their participants.
  const orFilter = (/** @type {string} */ field) =>
    pb.filter(
      ids.map((_, i) => `${field} = {:p${i}}`).join(' || '),
      Object.fromEntries(ids.map((id, i) => [`p${i}`, id]))
    );

  const [allTrips, participants] = await Promise.all([
    pb.collection('trips').getFullList({ filter: orFilter('id') }),
    pb.collection('participants').getFullList({ filter: orFilter('trip'), expand: 'user' })
  ]);
  // Idea-stage ("someday") trips live on the Ideas wishlist, not the dated
  // dashboard — they have no dates to bucket. Keep them out here.
  const trips = allTrips.filter((t) => t.status !== 'idea');

  /** @type {Record<string, { members: number, going: number, maybe: number }>} */
  const stats = {};
  /** @typedef {{ name: string, avatar?: string, _going: boolean, _me: boolean }} CrewEntry */
  /** @type {Record<string, CrewEntry[]>} crew per trip (sorted + capped when attached below) */
  const crewByTrip = {};
  for (const p of participants) {
    const s = (stats[p.trip] ??= { members: 0, going: 0, maybe: 0 });
    s.members++;
    if (p.rsvp_status === 'going') s.going++;
    else if (p.rsvp_status === 'maybe') s.maybe++;
    const crew = (crewByTrip[p.trip] ??= []);
    crew.push({
      name: participantName(p),
      avatar: avatarUrl(p.expand?.user),
      _going: p.rsvp_status === 'going',
      _me: p.user === userId
    });
  }

  // Avatar preview order: going members lead the stack, and the viewer leads
  // within their tier so "me" is never the one dropped by the 5-avatar cap.
  /** @param {CrewEntry[]} crew */
  const crewPreview = (crew) =>
    crew
      .slice()
      .sort((a, b) => Number(b._going) - Number(a._going) || Number(b._me) - Number(a._me))
      .slice(0, 5)
      .map(({ name, avatar }) => ({ name, avatar }));

  const today = todayUtc();
  /** @type {DashTrip[]} */
  const items = trips.map((t) => {
    const start = dateOnly(t.start_date);
    const end = dateOnly(t.end_date);
    return {
      id: t.id,
      name: t.name,
      slug: t.share_token,
      location: t.location ?? '',
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      role: roleByTrip[t.id] ?? 'guest',
      status: t.status || 'confirmed',
      trip_type: t.trip_type ?? 'other',
      ...(stats[t.id] ?? { members: 0, going: 0, maybe: 0 }),
      crew: crewPreview(crewByTrip[t.id] ?? []),
      _start: start,
      _bucket: bucketOf({ start, end }, today)
    };
  });

  /** @type {Dashboard} */
  const out = { current: [], upcoming: [], past: [] };
  for (const it of items) out[it._bucket].push(it);
  // Upcoming/current: soonest first. Past: most recent first.
  out.upcoming.sort((a, b) => (a._start < b._start ? -1 : a._start > b._start ? 1 : 0));
  out.current.sort((a, b) => (a._start < b._start ? -1 : a._start > b._start ? 1 : 0));
  out.past.sort((a, b) => (a._start > b._start ? -1 : a._start < b._start ? 1 : 0));
  return out;
}
