// City segments for a trip (#3). Each city is a dated leg of a multi-stop trip;
// itinerary days group under whichever city's range contains them (derived from
// dates, so itinerary items carry no city field). Pure shaping here; writes go
// through the /[share_token]/actions op endpoint.

/** @param {string|undefined|null} d a PB datetime → "YYYY-MM-DD" */
const dateOnly = (d) => String(d ?? '').slice(0, 10);

/**
 * @typedef {Object} City
 * @property {string} id
 * @property {string} name
 * @property {string} start_date  YYYY-MM-DD ('' if unset)
 * @property {string} end_date    YYYY-MM-DD ('' if unset)
 * @property {number} sortOrder
 */

/**
 * Shape + order raw trip_cities rows for the client. Dated cities come first in
 * chronological order; undated ones trail by insertion order (sort_order).
 * @param {Array<any>} rows
 * @returns {City[]}
 */
export function shapeCities(rows) {
  return rows
    .map((c) => ({
      id: c.id,
      name: c.name ?? '',
      start_date: dateOnly(c.start_date),
      end_date: dateOnly(c.end_date),
      sortOrder: c.sort_order ?? 0
    }))
    .sort((a, b) => {
      if (a.start_date && b.start_date) return a.start_date.localeCompare(b.start_date);
      if (a.start_date) return -1; // dated before undated
      if (b.start_date) return 1;
      return a.sortOrder - b.sortOrder;
    });
}

/**
 * Load a trip's cities, shaped and ordered. Missing collection (pre-migration)
 * or a transient error yields an empty list so the trip still renders.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} tripId
 * @returns {Promise<City[]>}
 */
export async function loadCities(pb, tripId) {
  try {
    const rows = await pb
      .collection('trip_cities')
      .getFullList({ filter: pb.filter('trip = {:t}', { t: tripId }) });
    return shapeCities(rows);
  } catch (_) {
    return [];
  }
}

/**
 * The city a given date belongs to — the last city whose range starts on/before
 * the date and (if it has an end) ends on/after it. Returns the city id or null.
 * Cities must be pre-sorted (as shapeCities leaves them).
 * @param {City[]} cities
 * @param {string} date  YYYY-MM-DD
 * @returns {string | null}
 */
export function cityForDate(cities, date) {
  const d = dateOnly(date);
  if (!d) return null;
  let match = null;
  for (const c of cities) {
    if (!c.start_date) continue;
    if (c.start_date <= d && (!c.end_date || c.end_date >= d)) match = c.id;
  }
  return match;
}
