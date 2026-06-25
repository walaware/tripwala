// Resolve a location_ideas `image` file value into a same-origin URL the browser
// can load. Mirrors userAvatar.js: the file is stored on the (superuser-locked)
// record and served by PocketBase at /api/files/{collection}/{recordId}/{file},
// which Caddy proxies in docker + prod. A same-origin path keeps the internal
// PB_URL off the wire and needs no CORS. Returns undefined when there's no image.

/**
 * @param {{ id: string, image?: string | null } | null | undefined} idea
 * @returns {string | undefined}
 */
export function locationImageUrl(idea) {
  const value = idea?.image;
  if (!value) return undefined;
  return `/api/files/location_ideas/${idea.id}/${encodeURIComponent(value)}`;
}
