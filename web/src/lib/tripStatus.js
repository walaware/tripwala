// Whether a trip is "finished" — the trigger for the post-trip space (photo
// wall + Wrapped recap). A trip counts as past when the organizer has marked it
// `completed`, OR its end date (or start date, for a single-day trip) is before
// today. "Today" is the viewer's LOCAL calendar day (the stored date-only value
// is read as a UTC date) — so a trip that ends "today" reads as ongoing until
// local midnight, not until some UTC cutoff mid-afternoon.
// Pure and importable on both server (loadTrip) and client (TripView) so the
// two never drift.

/**
 * @param {{ status?: string, start_date?: string, end_date?: string }} trip
 * @returns {boolean}
 */
export function isTripPast(trip) {
  if (trip?.status === 'completed') return true;
  const end = trip?.end_date || trip?.start_date;
  if (!end) return false;
  const e = new Date(end);
  if (Number.isNaN(e.getTime())) return false;
  const n = new Date();
  return (
    Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) >
    Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
  );
}
