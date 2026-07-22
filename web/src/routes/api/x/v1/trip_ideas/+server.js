import { json } from '@sveltejs/kit';
import { authorize, listResponse } from '$lib/server/apiGuard.js';
import { activeTripIds, anyOf } from '$lib/server/apiData.js';
import { createTrip, TripCreateError } from '$lib/server/createTrip.js';

// GET /api/x/v1/trip_ideas — the caller's "someday" ideas (trips in status='idea'),
// user-confined. Shape matches the PB-hook surface: { id, name, location, created }.
export async function GET(event) {
  const { pb, auth } = await authorize(event, 'trip_ideas:read');

  const ids = await activeTripIds(pb, auth.userId);
  const filter = anyOf(pb, 'id', ids);
  if (!filter) return listResponse([]);

  const rows = await pb.collection('trips').getFullList({ filter, sort: '-created' });
  const items = rows
    .filter((t) => t.status === 'idea')
    .map((t) => ({
      id: t.id,
      name: t.name,
      location: t.location ?? '',
      created: String(t.created ?? '')
    }));
  return listResponse(items);
}

// POST /api/x/v1/trip_ideas  body: { "name": "…", "location"?: "…" }
// Create a "someday" idea. Mirrors the UI's trip creation: the caller becomes the
// idea's ORGANIZER member (via createTrip), so — unlike the whole-app service
// surface's orphan ideas — this one is owned by the user, on their Ideas list.
export async function POST(event) {
  const { pb, auth } = await authorize(event, 'trip_ideas:write');

  const body = await event.request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (!name || name.length > 200) {
    return json({ message: 'name is required and must be <= 200 chars' }, { status: 400 });
  }
  const location = String(body?.location ?? '').trim().slice(0, 300);

  // createTrip enrolls the user as organizer; a personal key acts AS its owner.
  // Load the real user so display name / default visibility match the UI path.
  /** @type {any} */
  let user;
  try {
    const u = await pb.collection('users').getOne(auth.userId);
    user = { id: u.id, name: u.name ?? '', email: u.email, default_trip_visibility: u.default_trip_visibility ?? '' };
  } catch (/** @type {any} */ _e) {
    user = { id: auth.userId };
  }
  try {
    const result = await createTrip(pb, user, { name, location, status: 'idea' });
    return json({
      id: result.trip.id,
      name: result.trip.name,
      location: result.trip.location ?? '',
      status: result.trip.status,
      share_token: result.share_token
    });
  } catch (/** @type {any} */ err) {
    if (err instanceof TripCreateError) {
      return json({ message: 'could not create the idea — please try again' }, { status: 502 });
    }
    throw err;
  }
}
