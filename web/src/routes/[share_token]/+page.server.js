import { loadTripByShareToken } from '$lib/server/loadTrip.js';

export async function load({ params }) {
  const data = await loadTripByShareToken(params.share_token);
  return data;
}
