import { fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { loadUserTrips } from '$lib/server/dashboard.js';
import { listMyInvitations, acceptInvitation, declineInvitation } from '$lib/server/invitations.js';
import { listIncomingRequests } from '$lib/server/friends.js';

// Signed in → dashboard of your trips, plus any pending trip invitations and a
// count of incoming friend requests. Logged out → marketing landing.
/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  if (!locals.user) return { trips: null, invitations: [], friendRequests: 0 };
  const pb = await superuserPb();
  const [trips, invitations, incoming] = await Promise.all([
    loadUserTrips(pb, locals.user.id),
    listMyInvitations(pb, locals.user.id),
    listIncomingRequests(pb, locals.user.id)
  ]);
  return { trips, invitations, friendRequests: incoming.length };
}

export const actions = {
  // Accept a trip invitation → join the trip and land on it.
  acceptInvite: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/');
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Missing invitation.' });
    const pb = await superuserPb();
    let share_token;
    try {
      ({ share_token } = await acceptInvitation(pb, locals.user, id));
    } catch (_) {
      return fail(400, { error: 'Could not accept that invitation.' });
    }
    throw redirect(303, `/${share_token}`);
  },

  declineInvite: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/');
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Missing invitation.' });
    const pb = await superuserPb();
    try {
      await declineInvitation(pb, locals.user.id, id);
    } catch (_) {
      return fail(400, { error: 'Could not decline that invitation.' });
    }
    return { declined: true };
  }
};
