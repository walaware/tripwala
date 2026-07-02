import { redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { resolveFriendToken, sendFriendRequest } from '$lib/server/friends.js';

// Shareable friend link (#30). Opening /add-friend/<token> while signed in sends
// a friend request to the token's owner, then lands on /friends. Signed out →
// login first, returning here. There's no page body — this route only acts and
// redirects.

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, locals }) {
  const token = params.token;
  if (!locals.user) throw redirect(303, `/login?next=/add-friend/${encodeURIComponent(token)}`);

  const pb = await superuserPb();
  const owner = await resolveFriendToken(pb, token);

  if (!owner) throw redirect(303, '/friends?add=notfound');
  if (owner.id === locals.user.id) throw redirect(303, '/friends?add=self');

  const res = await sendFriendRequest(pb, locals.user.id, owner.id);
  const status = res.status === 'accepted' ? 'accepted' : 'sent';
  throw redirect(303, `/friends?add=${status}`);
}
