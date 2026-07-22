import { authorize, listResponse } from '$lib/server/apiGuard.js';

// GET /api/x/v1/invitations — trip invitations addressed to the CALLER (the
// `trip_invitations.user` recipient relation), user-confined. Shape matches the
// PB-hook surface: { id, trip, status }.
export async function GET(event) {
  const { pb, auth } = await authorize(event, 'invitations:read');

  const rows = await pb
    .collection('trip_invitations')
    .getFullList({ filter: pb.filter('user = {:u}', { u: auth.userId }), sort: '-created' });
  const items = rows.map((i) => ({
    id: i.id,
    trip: i.trip,
    status: i.status ?? ''
  }));
  return listResponse(items);
}
