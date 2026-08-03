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
import { immichAlbumId as immichAlbumIdFromUrl } from '../photoProviders.js';

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

// ---------------------------------------------------------------------------
// Reading album photos (#post-trip photo wall). We surface REAL thumbnails from
// the trip's Immich album — but the admin API key never leaves the server, so
// the client only ever gets our own proxy URLs (see the [share_token]/photo
// route). Best-effort throughout: a finished trip must still render if Immich is
// down or unconfigured.
// ---------------------------------------------------------------------------

/**
 * Resolve the Immich album id for a trip, or null. App-created albums store the
 * id directly; a manually pasted `…/albums/<uuid>` web link carries the id in
 * its path (that's Sam's case — pasted links have no photo_album_id).
 * @param {{ photo_album_id?: string, photo_album_url?: string }} trip
 * @returns {string | null}
 */
export function immichAlbumId(trip) {
  if (trip?.photo_album_id) return String(trip.photo_album_id);
  return immichAlbumIdFromUrl(trip?.photo_album_url || '');
}

// Short-lived in-memory cache of a trip's album assets, keyed by album id. One
// finished-trip page fetches ~30 thumbnails, each hitting our proxy — without
// this we'd re-list the album from Immich on every single thumbnail request.
const ALBUM_CACHE_MS = 60_000;
/** @type {Map<string, { assets: { id: string, type: string }[], ids: Set<string>, exp: number }>} */
const albumCache = new Map();

/**
 * List a trip's album assets (cached). Returns null when there's no resolvable
 * album or Immich is unreachable/unconfigured.
 * @param {{ photo_album_id?: string, photo_album_url?: string }} trip
 */
async function loadAlbum(trip) {
  const id = immichAlbumId(trip);
  if (!id) return null;
  const now = Date.now();
  const hit = albumCache.get(id);
  if (hit && hit.exp > now) return hit;
  if (!(await immichConfigured())) return null;
  try {
    // Immich v3 dropped the embedded `assets` array from GET /api/albums/{id};
    // the metadata search is how you list an album's assets now. `size` is a
    // generous single-page cap — enough for the guard set and the ~30 we show
    // (huge albums beyond it just aren't guarded past the first page, which only
    // means a late thumbnail 404s — never a leak).
    const result = await api('POST', '/api/search/metadata', { albumIds: [id], size: 1000 });
    const items = Array.isArray(result?.assets?.items) ? result.assets.items : [];
    const assets = items
      .filter((/** @type {any} */ a) => a?.id)
      .map((/** @type {any} */ a) => ({ id: String(a.id), type: String(a.type || 'IMAGE') }));
    const entry = { assets, ids: new Set(assets.map((/** @type {{id:string}} */ a) => a.id)), exp: now + ALBUM_CACHE_MS };
    albumCache.set(id, entry);
    return entry;
  } catch {
    return null; // best-effort: never break the trip page on an Immich hiccup
  }
}

/**
 * The trip album's photos, capped, as `{ id, type }`. Callers build proxy URLs
 * from the ids — the raw Immich URL and key stay server-side.
 * @param {{ photo_album_id?: string, photo_album_url?: string }} trip
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ id: string, type: string }[]>}
 */
export async function fetchAlbumPhotos(trip, { limit = 30 } = {}) {
  const album = await loadAlbum(trip);
  return album ? album.assets.slice(0, limit) : [];
}

/**
 * Whether an asset id belongs to a trip's album. The proxy endpoint's authz
 * guard — without it, any valid share_token could pull ANY asset off the Immich
 * instance (the admin key sees everything).
 * @param {{ photo_album_id?: string, photo_album_url?: string }} trip
 * @param {string} assetId
 */
export async function albumHasAsset(trip, assetId) {
  const album = await loadAlbum(trip);
  return Boolean(album && album.ids.has(assetId));
}

/**
 * Fetch a single asset's thumbnail from Immich, authenticated with the admin
 * key. Returns the raw fetch Response (stream the body through) or null on any
 * failure. Callers MUST have verified the asset belongs to the trip first.
 * @param {string} assetId
 * @param {'thumbnail' | 'preview'} [size]
 * @returns {Promise<Response | null>}
 */
export async function fetchThumbnail(assetId, size = 'thumbnail') {
  const { url, apiKey, configured } = await loadImmichConfig();
  if (!configured) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/assets/${assetId}/thumbnail?size=${encodeURIComponent(size)}`, {
      headers: { 'x-api-key': apiKey },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    return res.ok ? res : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
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
