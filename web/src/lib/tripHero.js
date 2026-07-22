// Trip hero artwork — which image represents a trip.
//
// Precedence, most specific first:
//   1. `trips.hero_image`             — an explicit cover uploaded for THIS trip
//   2. `picked_location.image`        — the uploaded photo of the spot the crew picked
//   3. `picked_location.previewImage` — the og:image scraped from that idea's link
//   4. the per-trip-type default      — generated artwork, passed in by the caller
//
// Resolves to '' when nothing matches, so callers fall back to the emoji tile
// rather than rendering a broken image.
//
// Deliberately pure: the per-type default is a PARAMETER, not something this
// module looks up. Resolving it needs `import.meta.glob`, a Vite compile-time
// transform that doesn't exist under plain node — keeping it out of here means
// this precedence logic stays testable and build-tool-agnostic. Components get
// the default from $lib/heroDefaults.js and pass it in.

/**
 * The image to represent a trip, by precedence.
 *
 * @param {{
 *   heroImage?: string,
 *   trip_type?: string | null,
 *   pickedLocation?: { image?: string, previewImage?: string } | null
 * } | null | undefined} trip callers pass the whole trip; `trip_type` is unused
 *   here (it's what the caller resolved `defaultSrc` from) but accepted so they
 *   don't have to destructure
 * @param {string} [defaultSrc] generated artwork for this trip's type, if any
 * @returns {string} a URL, or '' if the trip has no artwork at all
 */
export function tripHeroSrc(trip, defaultSrc = '') {
  if (!trip) return defaultSrc || '';
  const picked = trip.pickedLocation;
  return trip.heroImage || picked?.image || picked?.previewImage || defaultSrc || '';
}

/**
 * Whether a trip's artwork is a real photograph of the trip/place rather than
 * generated type artwork. Photos are unpredictable and sit under text, so they
 * earn a heavier scrim; the generated defaults are already low-contrast.
 *
 * @param {{ heroImage?: string, trip_type?: string | null, pickedLocation?: { image?: string, previewImage?: string } | null } | null | undefined} trip
 */
export function heroIsPhoto(trip) {
  if (!trip) return false;
  return Boolean(trip.heroImage || trip.pickedLocation?.image || trip.pickedLocation?.previewImage);
}
