import { authorize, listResponse } from '$lib/server/apiGuard.js';
import { activeTripIds, anyOf } from '$lib/server/apiData.js';

// GET /api/x/v1/participants?trip=<id> — participants of the caller's trips,
// user-confined. Optional ?trip= narrows to one of THEIR trips (a foreign trip id
// simply yields nothing — never another trip's roster). Shape matches the PB-hook
// surface: { id, trip, name, role } (name = display_name).
export async function GET(event) {
  const { pb, auth } = await authorize(event, 'participants:read');

  const myTripIds = await activeTripIds(pb, auth.userId);
  const requested = event.url.searchParams.get('trip');
  // Confine to the requested trip only if the caller actually belongs to it.
  const ids = requested ? myTripIds.filter((id) => id === requested) : myTripIds;

  const filter = anyOf(pb, 'trip', ids);
  if (!filter) return listResponse([]);

  const rows = await pb.collection('participants').getFullList({ filter, sort: '-created' });
  const items = rows.map((p) => ({
    id: p.id,
    trip: p.trip,
    name: p.display_name ?? '',
    role: p.role ?? 'guest'
  }));
  return listResponse(items);
}
