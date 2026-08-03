// Thumbnail proxy for the post-trip photo wall. Streams a single Immich album
// thumbnail, authenticated server-side with the admin API key so that key never
// reaches the browser. Two guards keep this from becoming an open proxy to the
// whole Immich instance:
//   1. the share_token must resolve to a real trip (the trip's capability secret)
//   2. the requested asset must actually belong to that trip's album
// The album is already shared to trip viewers, so this exposes nothing new.

import { error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { albumHasAsset, fetchThumbnail } from '$lib/server/immich.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
  const { share_token, assetId } = params;

  // Shape guard: Immich asset ids are UUIDs. Reject anything else before we do
  // any lookups (also stops path-ish inputs cold).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) {
    throw error(404, 'Not found');
  }

  const pb = await superuserPb();
  let trip;
  try {
    trip = await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: share_token }));
  } catch {
    throw error(404, 'Not found');
  }

  if (!(await albumHasAsset(/** @type {any} */ (trip), assetId))) throw error(404, 'Not found');

  const res = await fetchThumbnail(assetId);
  if (!res || !res.body) throw error(404, 'Not found');

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'image/jpeg',
      // Private (gated by share_token) but cacheable for the session so scrolling
      // the wall doesn't re-hit Immich for every thumbnail.
      'Cache-Control': 'private, max-age=3600'
    }
  });
}
