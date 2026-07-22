// Resolve a trips `hero_image` file value into a same-origin URL the browser can
// load. Exact mirror of locationMedia.js — the file lives on the (superuser-
// locked) trip record and PocketBase serves it at
// /api/files/{collection}/{recordId}/{file}, which Caddy proxies in docker +
// prod. A same-origin path keeps the internal PB_URL off the wire and needs no
// CORS. Returns undefined when the trip has no cover uploaded.
//
// The field and its thumbs were provisioned by the trip_import_fields migration
// (thumbs: '416x224' for the trip card, '1000x0' for the wide banner).

/**
 * @param {{ id: string, hero_image?: string | null } | null | undefined} trip
 * @param {string} [thumb] PocketBase thumb size — must be one of the field's
 *   registered thumbs ('416x224' | '1000x0') or PB returns the original.
 * @returns {string | undefined}
 */
export function heroImageUrl(trip, thumb) {
  const value = trip?.hero_image;
  if (!value) return undefined;
  const base = `/api/files/trips/${trip.id}/${encodeURIComponent(value)}`;
  return thumb ? `${base}?thumb=${encodeURIComponent(thumb)}` : base;
}
