import { redirect, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { resolveFriendToken, sendFriendRequest } from '$lib/server/friends.js';
import { rateLimit, clientIp } from '$lib/server/rateLimit.js';

// Shareable friend link (#30). Opening /add-friend/<token> while signed in sends
// a friend request to the token's owner, then lands on /friends. Signed out →
// login first, returning here. There's no page body — this route only acts and
// redirects.

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
  const { params, locals } = event;
  const token = params.token;
  if (!locals.user) throw redirect(303, `/login?next=/add-friend/${encodeURIComponent(token)}`);

  // A friend token is 12 random base64url chars (~72 bits), so guessing one is
  // hopeless — but each miss is a DB lookup, and an authenticated user should
  // not be able to spray them. Throttle per IP.
  const limited = rateLimit(`friend-token:${clientIp(event)}`, { limit: 15, windowMs: 60_000 });
  if (!limited.ok) throw error(429, 'Too many attempts — give it a moment.');

  const pb = await superuserPb();
  const owner = await resolveFriendToken(pb, token);

  if (!owner) throw redirect(303, '/friends?add=notfound');
  if (owner.id === locals.user.id) throw redirect(303, '/friends?add=self');

  const res = await sendFriendRequest(pb, locals.user.id, owner.id);
  const status = res.status === 'accepted' ? 'accepted' : 'sent';
  throw redirect(303, `/friends?add=${status}`);
}
