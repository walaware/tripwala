// Map deep links for the "Navigate" button on itinerary entries.
//
// An entry's `place` is free text — a place name ("Olmsted Point, Yosemite"), an
// address, or a "lat,lng" pair. Both Apple and Google accept any of these as a
// directions destination, so we don't geocode: we just URL-encode the string
// into each app's directions scheme. We build BOTH links up front and let the
// caller render the one matching the viewer's preference (see $lib/prefs.js →
// mapApp), so switching the pref changes which link renders — no re-fetch.

/** @typedef {import('./prefs.js').MapApp} MapApp */

/**
 * Directions URL into Apple Maps for a destination query.
 * `daddr` is the destination; `dirflg=d` asks for driving directions.
 * @param {string} place
 */
export function appleMapsUrl(place) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(place)}&dirflg=d`;
}

/**
 * Directions URL into Google Maps for a destination query (the documented
 * Maps URLs API form, which works on web, Android, and iOS).
 * @param {string} place
 */
export function googleMapsUrl(place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
}

/**
 * Both deep links for a place, or null when there's nothing to navigate to.
 * @param {string | null | undefined} place
 * @returns {{ apple: string, google: string } | null}
 */
export function mapLinks(place) {
  const q = String(place ?? '').trim();
  if (!q) return null;
  return { apple: appleMapsUrl(q), google: googleMapsUrl(q) };
}

/**
 * The single link to render for a viewer, picked by their map-app preference.
 * @param {string | null | undefined} place
 * @param {MapApp} app  'apple' | 'google'
 * @returns {string | null}
 */
export function navUrl(place, app) {
  const links = mapLinks(place);
  if (!links) return null;
  return app === 'google' ? links.google : links.apple;
}
