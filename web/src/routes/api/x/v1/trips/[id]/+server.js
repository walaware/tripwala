import { json } from '@sveltejs/kit';
import { authorize } from '$lib/server/apiGuard.js';
import { loadTripById, requireActiveMembership, assertOrganizer } from '$lib/server/tripAuthz.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** YYYY-MM-DD → PB datetime at UTC midnight; empty stays empty. @param {string} d */
const toPb = (d) => (d ? `${d} 00:00:00.000Z` : '');

// PATCH /api/x/v1/trips/{id}  body: { name?, location?, start_date?, end_date? }
// Edit a trip's core details. ORGANIZER-only on that trip — same guard as the UI's
// `trip_update` (via the shared authz helper), mirroring its validation. Fields are
// optional (only what's present is changed); dates are YYYY-MM-DD. Description prose
// is added via the /note endpoint (append-only), not replaced here.
export async function PATCH(event) {
  const { pb, auth } = await authorize(event, 'trips:write');

  const trip = await loadTripById(pb, event.params.id);
  const { isOrganizer } = await requireActiveMembership(pb, trip, auth.userId);
  assertOrganizer(isOrganizer, 'Only organizers can edit the trip');

  const body = await event.request.json().catch(() => ({}));

  /** @type {Record<string, unknown>} */
  const data = {};
  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 200);
    if (!name) return json({ message: 'name cannot be empty' }, { status: 400 });
    data.name = name;
  }
  if (body?.location !== undefined) {
    data.location = String(body.location ?? '').trim().slice(0, 300);
  }
  if (body?.start_date !== undefined) {
    const s = String(body.start_date ?? '').slice(0, 10);
    if (s && !DATE_ONLY.test(s)) return json({ message: 'bad start_date (use YYYY-MM-DD)' }, { status: 400 });
    data.start_date = toPb(s);
  }
  if (body?.end_date !== undefined) {
    const e = String(body.end_date ?? '').slice(0, 10);
    if (e && !DATE_ONLY.test(e)) return json({ message: 'bad end_date (use YYYY-MM-DD)' }, { status: 400 });
    data.end_date = toPb(e);
  }

  // Cross-field date sanity, against the resulting (new-or-existing) values.
  const start = data.start_date !== undefined ? String(data.start_date) : String(trip.start_date ?? '');
  const end = data.end_date !== undefined ? String(data.end_date) : String(trip.end_date ?? '');
  if (start && end && end < start) {
    return json({ message: 'end date is before the start date' }, { status: 400 });
  }

  if (!Object.keys(data).length) {
    return json({ message: 'no editable fields provided' }, { status: 400 });
  }

  const updated = await pb.collection('trips').update(trip.id, data);
  return json({
    id: updated.id,
    name: updated.name,
    location: updated.location ?? '',
    start_date: updated.start_date ?? '',
    end_date: updated.end_date ?? '',
    status: updated.status ?? ''
  });
}
