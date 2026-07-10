import { redirect } from '@sveltejs/kit';
import { safeNext } from '$lib/server/authFlow.js';

// There is no separate sign-up any more: signing in with Google creates the
// account on first use. This route survives only so old links, bookmarks and
// invite emails that point at /signup still land somewhere sensible.
export function GET({ url }) {
  const next = safeNext(url.searchParams.get('next'));
  throw redirect(308, `/login?next=${encodeURIComponent(next)}`);
}
