// Shared photo-album providers. A trip can surface photos in two ways:
//   1. An Immich album we create + embed (see server/immich.js) — self-hosted,
//      frames fine, and we can keep its name in sync.
//   2. ANY provider's shared album, pasted as a link — Google Photos, iCloud
//      Shared Albums, another Immich instance, etc.
//
// The catch is embedding: Immich frames inline, but Google Photos and iCloud
// send X-Frame-Options/CSP that block iframes, so those must link out instead
// of showing a blank frame. This module is the single source of truth for
// "which provider is this URL, and can we embed it?" — pure and safe to import
// on both the server and the client.

/** @typedef {'google' | 'apple' | 'immich'} PhotoProvider */

/**
 * @typedef {object} PhotoAlbum
 * @property {string} url         the album's share URL, verbatim
 * @property {PhotoProvider} provider
 * @property {string} label       human label for the provider ("Google Photos")
 * @property {boolean} embeddable  whether it can be shown in an iframe
 */

/**
 * Classify a shared-album URL by provider. Unknown hosts are treated as Immich
 * (self-hosted instances live on arbitrary domains, and framing is the existing
 * behaviour for a pasted link). Google Photos and iCloud are recognised so we
 * can link out instead of framing a blocked embed.
 * @param {string} url
 * @returns {PhotoAlbum | null}
 */
export function photoAlbum(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  let host = '';
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    // Not a parseable URL — treat as an opaque/self-hosted link (framed).
    return { url: raw, provider: 'immich', label: 'the album', embeddable: true };
  }
  if (host === 'photos.google.com' || host === 'photos.app.goo.gl') {
    return { url: raw, provider: 'google', label: 'Google Photos', embeddable: false };
  }
  if (host === 'share.icloud.com' || host.endsWith('.icloud.com')) {
    return { url: raw, provider: 'apple', label: 'iCloud Photos', embeddable: false };
  }
  return { url: raw, provider: 'immich', label: 'the album', embeddable: true };
}

/**
 * Validate a pasted album share link. Requires a real http(s) URL (which also
 * rejects `javascript:`/`data:` and other schemes before we ever render it as
 * an iframe src or href). Returns the classified album, or null if invalid.
 * @param {string} input
 * @returns {PhotoAlbum | null}
 */
export function parseAlbumLink(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  return photoAlbum(u.toString().replace(/\/+$/, ''));
}
