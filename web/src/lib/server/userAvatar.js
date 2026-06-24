// Resolve a users-collection `avatar` value into a URL the browser can load.
//
// Two shapes occur in the wild and we must handle both:
//   1. An absolute URL — PocketBase's `url` avatar field populated directly
//      from Google's `avatarURL` (e.g. https://lh3.googleusercontent.com/...).
//   2. A bare filename — when the photo was stored as a file on the record;
//      served by PocketBase at /api/files/{collection}/{recordId}/{filename}.
//
// We return a SAME-ORIGIN path for case 2 (/api/files/...), which Caddy proxies
// to PocketBase in docker and in prod. That keeps the internal PB_URL off the
// wire and needs no CORS. Returning undefined lets the Avatar component fall
// back to the colored initial.

/**
 * @param {{ id: string, avatar?: string | null } | null | undefined} user
 * @returns {string | undefined}
 */
export function avatarUrl(user) {
  const value = user?.avatar;
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `/api/files/users/${user.id}/${encodeURIComponent(value)}`;
}
