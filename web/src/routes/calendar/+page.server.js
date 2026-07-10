import { redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { loadUserTrips } from '$lib/server/dashboard.js';
import { loadFriendsCalendar } from '$lib/server/calendar.js';

// Personal calendar (#30, Surface B). Two layers:
//  - YOUR trips (full data, link through to the trip) from the dashboard loader.
//  - Friends' trips shared at 'friends' visibility, as read-only teasers (no link).
// The page renders them on a month grid, visually distinguishing the two.

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  if (!locals.user) throw redirect(303, '/login?next=/calendar');
  const pb = await superuserPb();
  const [mine, friends] = await Promise.all([
    loadUserTrips(pb, locals.user.id),
    loadFriendsCalendar(pb, locals.user.id)
  ]);
  // Flatten my bucketed trips into a single list of dated events for the grid.
  const ownEvents = [...mine.current, ...mine.upcoming, ...mine.past]
    .filter((t) => t.start_date)
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      location: t.location,
      start_date: t.start_date,
      end_date: t.end_date || t.start_date,
      kind: 'own'
    }));
  // `busy` teasers already arrive with name/location blanked by the loader.
  const friendEvents = friends
    .filter((t) => t.start_date)
    .map((t) => ({
      id: `f-${t.id}`,
      name: t.name,
      location: t.location,
      start_date: t.start_date,
      end_date: t.end_date || t.start_date,
      busy: t.busy,
      friends: t.friends,
      kind: 'friend'
    }));
  return { ownEvents, friendEvents };
}
