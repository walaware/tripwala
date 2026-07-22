import { json } from '@sveltejs/kit';
import { authorize } from '$lib/server/apiGuard.js';
import { loadTripById, requireActiveMembership, assertOrganizer } from '$lib/server/tripAuthz.js';
import { escapeHtml } from '$lib/server/createTrip.js';

// POST /api/x/v1/trips/{id}/note  body: { "note": "…" }
// Append a note paragraph to the trip's `description` (there is no dedicated
// trip-note field). ORGANIZER-only on that trip — routed through the SAME authz
// helper the UI uses, so a guest's key gets the same 403 the UI gives them.
export async function POST(event) {
  const { pb, auth } = await authorize(event, 'trips:write');

  const trip = await loadTripById(pb, event.params.id);
  const { isOrganizer } = await requireActiveMembership(pb, trip, auth.userId);
  assertOrganizer(isOrganizer, 'Only organizers can edit the trip');

  const body = await event.request.json().catch(() => ({}));
  const note = String(body?.note ?? '').trim();
  if (!note || note.length > 500) {
    return json({ message: 'note is required and must be <= 500 chars' }, { status: 400 });
  }

  const existing = trip.description ?? '';
  // Additive, but bounded: repeated appends must not grow the shared description
  // without limit (it's rendered for every trip member). ~20k of stored HTML is
  // generous headroom over the UI's 5k-char editor cap.
  const MAX_DESCRIPTION = 20_000;
  const addition = `<p>${escapeHtml(note)}</p>`;
  if (existing.length + addition.length > MAX_DESCRIPTION) {
    return json({ message: 'trip description is full — trim it in the app first' }, { status: 400 });
  }
  await pb.collection('trips').update(trip.id, { description: existing + addition });
  return json({ id: trip.id, note });
}
