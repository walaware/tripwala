import { authorize, listResponse } from '$lib/server/apiGuard.js';
import { activeTripIds, anyOf } from '$lib/server/apiData.js';

// GET /api/x/v1/trips — the caller's real (non-idea) trips, user-confined.
// Payload shape matches the PB-hook service surface (api_x.pb.js) so a consumer
// sees one contract: { id, name, location, start_date, end_date, status }.
export async function GET(event) {
  const { pb, auth } = await authorize(event, 'trips:read');

  const ids = await activeTripIds(pb, auth.userId);
  const filter = anyOf(pb, 'id', ids);
  if (!filter) return listResponse([]);

  const rows = await pb.collection('trips').getFullList({ filter, sort: '-created' });
  const items = rows
    .filter((t) => t.status !== 'idea')
    .map((t) => ({
      id: t.id,
      name: t.name,
      location: t.location ?? '',
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      status: t.status ?? ''
    }));
  return listResponse(items);
}
