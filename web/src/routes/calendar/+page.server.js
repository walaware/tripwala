import { redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { loadUserTrips } from '$lib/server/dashboard.js';
import { loadFriendsCalendar } from '$lib/server/calendar.js';
import { listFriends } from '$lib/server/friends.js';
import { displayName } from '$lib/displayName.js';
import { avatarUrl } from '$lib/server/userAvatar.js';

// Personal calendar (#30, Surface B) — calendar + friends rail (redesign).
//  - YOUR trips (full data, link through) from the dashboard loader.
//  - Friends' 'friends'/'busy'-shared trips as read-only teasers (redacted here,
//    server-side — never send private fields to a friend's client).
// Events are attributed to a person (you, or a friend) so the page can colour
// them by owner and filter them from the "Whose trips" rail. A trip you're BOTH
// on is rendered once — your own bar, marked shared with co-travellers — not as
// a duplicate teaser.

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  if (!locals.user) throw redirect(303, '/login?next=/calendar');
  const pb = await superuserPb();
  const [mine, friendTrips, friends] = await Promise.all([
    loadUserTrips(pb, locals.user.id),
    loadFriendsCalendar(pb, locals.user.id),
    listFriends(pb, locals.user.id)
  ]);

  const myName = displayName(locals.user.name || '', locals.user) || 'You';
  const myAvatar = avatarUrl(locals.user) || '';

  const ownList = [...mine.current, ...mine.upcoming, ...mine.past].filter((t) => t.start_date);
  const ownTripIds = new Set(ownList.map((t) => t.id));

  // Split friends' shared trips: teasers (theirs alone) vs shared (you're both on
  // it → dedup: attach its friends as co-travellers to your own bar, drop the
  // teaser). Also index co-travellers per shared trip id.
  /** @type {Map<string, Array<{ id: string, name: string }>>} */
  const coTravellersByTrip = new Map();
  const teasers = [];
  for (const t of friendTrips) {
    if (ownTripIds.has(t.id)) {
      coTravellersByTrip.set(t.id, t.friends.map((f) => ({ id: f.id, name: f.name })));
    } else {
      teasers.push(t);
    }
  }

  const ownEvents = ownList.map((t) => {
    const co = coTravellersByTrip.get(t.id) ?? [];
    return {
      id: t.id,
      title: t.name,
      start: ymd(t.start_date),
      end: ymd(t.end_date || t.start_date),
      slug: t.slug,
      ownerId: 'you',
      shared: co.length > 0,
      coTravellers: co
    };
  });

  const teaserEvents = teasers.map((t) => ({
    id: `f-${t.id}`,
    name: t.name,
    start: ymd(t.start_date),
    end: ymd(t.end_date || t.start_date),
    busy: t.busy,
    // Who to attribute (colour + filter) — the friends of mine on this trip.
    owners: t.friends.map((f) => ({ id: f.id, name: f.name }))
  }));

  // Trip counts per friend: teasers they own + shared trips they co-travel.
  /** @param {string} fid */
  const countFor = (fid) =>
    teaserEvents.filter((e) => e.owners.some((o) => o.id === fid)).length +
    ownEvents.filter((e) => e.coTravellers.some((c) => c.id === fid)).length;

  const people = [
    { id: 'you', label: 'You', colorName: myName, avatar: myAvatar, count: ownEvents.length, isYou: true },
    ...friends.map((f) => ({ id: f.id, label: f.name, colorName: f.name, avatar: f.avatar ?? '', count: countFor(f.id), isYou: false }))
  ];

  return { people, ownEvents, teaserEvents };
}

const ymd = (/** @type {string} */ d) => String(d ?? '').slice(0, 10);
