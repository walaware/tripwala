// Immich integration (#21): create a shared photo album per trip, on demand —
// never automatically. The instance admin configures the connection (see
// appSettings.js); these helpers talk to that instance's REST API with the
// configured API key.
//
// NOTE on SSRF: unlike unfurl.js (which fetches arbitrary USER-supplied URLs and
// guards hard against private ranges), the Immich base URL is set by the
// instance ADMIN and is expected to be an internal/self-hosted host (e.g.
// http://192.168.x.x:2283). So we deliberately use a plain fetch here — guarding
// against private IPs would break the intended setup. Trust boundary: admin-only.

import { loadImmichConfig } from './appSettings.js';
import { albumName } from '../format.js';

const TIMEOUT_MS = 8000;

/** Whether Immich is configured (URL + key present, from DB or env). */
export async function immichConfigured() {
  return (await loadImmichConfig()).configured;
}

/**
 * Low-level Immich API call. Throws an Error with a useful message on failure.
 * @param {string} method
 * @param {string} path  e.g. '/api/albums'
 * @param {object} [body]
 */
async function api(method, path, body) {
  const { url, apiKey, configured } = await loadImmichConfig();
  if (!configured) throw new Error('Immich is not configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = /** @type {any} */ (err)?.name === 'AbortError' ? 'timed out' : 'unreachable';
    throw new Error(`Immich ${reason} at ${url}`);
  }
  clearTimeout(timer);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Immich API ${res.status} on ${method} ${path}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  if (res.status === 204) return null;
  return await res.json().catch(() => null);
}

/** Build the public share URL for a shared-link key. @param {string} key */
async function shareUrl(key) {
  const { url } = await loadImmichConfig();
  return `${url}/share/${key}`;
}

/**
 * Create an album for a trip and a public shared link to it. Returns the album
 * id (for later renames) and the share URL (for embedding). Does NOT attach any
 * assets — the album starts empty for people to fill from Immich.
 * @param {{ name?: string, trip_type?: string | null }} trip
 * @returns {Promise<{ albumId: string, albumUrl: string }>}
 */
export async function createTripAlbum(trip) {
  const album = await api('POST', '/api/albums', { albumName: albumName(trip) });
  if (!album?.id) throw new Error('Immich did not return an album id');
  const link = await api('POST', '/api/shared-links', { type: 'ALBUM', albumId: album.id });
  if (!link?.key) throw new Error('Immich did not return a share key');
  return { albumId: album.id, albumUrl: await shareUrl(link.key) };
}

/**
 * Rename an existing album to match the trip's current "Type - Name" convention.
 * No-op if the trip has no linked album. Best-effort: callers may ignore errors
 * so a rename failure never blocks saving the trip.
 * @param {{ photo_album_id?: string, name?: string, trip_type?: string | null }} trip
 */
export async function syncAlbumName(trip) {
  if (!trip?.photo_album_id) return;
  await api('PATCH', `/api/albums/${trip.photo_album_id}`, { albumName: albumName(trip) });
}
