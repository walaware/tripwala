import { fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { rateLimit, clientIp } from '$lib/server/rateLimit.js';
import {
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  coTravelers,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  unfriend,
  findUserByEmail,
  ensureFriendToken
} from '$lib/server/friends.js';

// The friend graph is NOT trip-scoped, so its mutations live here as form actions
// (guarded by locals.user) rather than on the trip actions endpoint. Everything
// is server-mediated via the superuser client and scoped to the signed-in user.

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
  if (!locals.user) throw redirect(303, '/login?next=/friends');
  const pb = await superuserPb();
  const me = locals.user.id;
  const [friends, incoming, outgoing, suggestions, token] = await Promise.all([
    listFriends(pb, me),
    listIncomingRequests(pb, me),
    listOutgoingRequests(pb, me),
    coTravelers(pb, me),
    ensureFriendToken(pb, me)
  ]);
  return {
    friends,
    incoming,
    outgoing,
    suggestions,
    friendLink: `${url.origin}/add-friend/${token}`
  };
}

export const actions = {
  // Send a request to a specific user (from a suggestion / friend picker).
  request: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/friends');
    const form = await request.formData();
    const target = String(form.get('user') ?? '').trim();
    if (!target) return fail(400, { error: 'Missing person.' });
    const pb = await superuserPb();
    await sendFriendRequest(pb, locals.user.id, target);
    return { requested: true };
  },

  // Send a request by email. Neutral response regardless of whether an account
  // exists (don't leak the directory), and rate-limited to blunt enumeration.
  requestByEmail: async (event) => {
    const { request, locals } = event;
    if (!locals.user) throw redirect(303, '/login?next=/friends');
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail(400, { emailError: 'Enter a valid email address.' });
    }
    const { ok } = rateLimit(`friend-email:${clientIp(event)}`, { limit: 10, windowMs: 60_000 });
    if (!ok) return fail(429, { emailError: 'Too many tries — wait a moment.' });

    const pb = await superuserPb();
    const target = await findUserByEmail(pb, email);
    if (target && target.id !== locals.user.id) {
      await sendFriendRequest(pb, locals.user.id, target.id);
    }
    // Same message whether or not they had an account.
    return { emailSent: true };
  },

  accept: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/friends');
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Missing request.' });
    const pb = await superuserPb();
    try {
      await acceptFriendRequest(pb, locals.user.id, id);
    } catch (_) {
      return fail(400, { error: 'Could not accept that request.' });
    }
    return { accepted: true };
  },

  // Decline an incoming request, cancel one I sent, or unfriend — all remove the
  // row (the server verifies I'm part of the pair).
  remove: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/friends');
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Missing friendship.' });
    const pb = await superuserPb();
    try {
      await removeFriendship(pb, locals.user.id, id);
    } catch (_) {
      return fail(400, { error: 'Could not update that.' });
    }
    return { removed: true };
  },

  // Unfriend by the other user's id (the friends list carries user ids, not
  // friendship row ids).
  unfriend: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/friends');
    const form = await request.formData();
    const user = String(form.get('user') ?? '').trim();
    if (!user) return fail(400, { error: 'Missing person.' });
    const pb = await superuserPb();
    await unfriend(pb, locals.user.id, user);
    return { removed: true };
  }
};
