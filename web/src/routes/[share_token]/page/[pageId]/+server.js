import { error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { getMembership } from '$lib/server/membership.js';
import { pageResponseHeaders } from '$lib/server/pages.js';

// Serve a trip page's stored HTML — the iframe src behind the Pages module.
// Members-only (same guard as the geocode proxy: a page is trip content, not
// for view-only share-link holders), and ALWAYS with the CSP sandbox headers
// from $lib/server/pages.js: the HTML is member-authored, so it must render
// with an opaque origin, never with this app's cookies or API reach.

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, locals }) {
  if (!locals.user) throw error(401, 'Sign in to view this page');

  const pb = await superuserPb();
  let trip;
  try {
    trip = await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: params.share_token }));
  } catch (_) {
    throw error(404, 'Trip not found');
  }
  const me = await getMembership(pb, trip.id, locals.user.id);
  if (!me || me.status === 'pending') throw error(403, 'Join this trip to view its pages');

  let page;
  try {
    page = await pb.collection('trip_pages').getOne(params.pageId);
  } catch (_) {
    throw error(404, 'Page not found');
  }
  if (page.trip !== trip.id) throw error(404, 'Page not found');

  return new Response(page.html ?? '', { headers: pageResponseHeaders() });
}
