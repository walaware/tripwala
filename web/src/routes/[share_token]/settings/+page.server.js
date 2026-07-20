import { error, fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import {
  getMembership,
  listPending,
  listInvites,
  joinTrip
} from '$lib/server/membership.js';
import { isMailConfigured } from '$lib/server/mailer.js';
import { immichConfigured } from '$lib/server/immich.js';
import { cloneTrip } from '$lib/server/cloneTrip.js';

// Trip settings — one home. Reached from the sidebar ⚙ (desktop), the mobile
// trip-home row, or any module's ⋯ menu. Any signed-in member can open it
// (guests get Notifications / Leave / Clone and, if allowed, the invite link);
// organizer-only groups (access toggles, people & roles, trip details, photos,
// stage) are gated on `isOrganizer`. All mutations go through the shared
// /[share_token]/actions endpoint (tripAction) except Clone, which creates a new
// trip and redirects, so it stays a form action here.

/**
 * @param {any} pb superuser client
 * @param {string} shareToken
 */
async function fetchTrip(pb, shareToken) {
  try {
    return await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: shareToken }));
  } catch (/** @type {any} */ err) {
    if (err?.status === 404) throw error(404, 'Trip not found');
    throw error(502, 'Could not reach the trip backend');
  }
}

/**
 * Members = participants linked to an account, organizers first.
 * @param {any} pb @param {string} tripId
 */
async function listMembers(pb, tripId) {
  const all = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('trip = {:t}', { t: tripId }), sort: 'display_name' });
  return all
    .filter((/** @type {any} */ p) => p.user)
    .map((/** @type {any} */ p) => ({
      id: p.id,
      display_name: p.display_name,
      role: p.role || 'guest'
    }))
    .sort((/** @type {any} */ a, /** @type {any} */ b) =>
      a.role === b.role ? 0 : a.role === 'organizer' ? -1 : 1
    );
}

export async function load({ params, locals }) {
  const pb = await superuserPb();
  const trip = await fetchTrip(pb, params.share_token);

  if (!locals.user) {
    throw redirect(303, `/login?next=${encodeURIComponent(`/${params.share_token}/settings`)}`);
  }

  const membership = await getMembership(pb, trip.id, locals.user.id);
  // Not a member yet (or still awaiting approval) → settings has nothing for
  // them; send them to the trip page, which shows the teaser / join / pending
  // state as appropriate.
  if (!membership || membership.status === 'pending') {
    throw redirect(303, `/${params.share_token}`);
  }

  const isOrganizer = membership.role === 'organizer';

  return {
    shareToken: trip.share_token,
    currentParticipantId: membership.id,
    isOrganizer,
    me: { name: membership.display_name, notify: membership.notify !== false },
    trip: {
      id: trip.id,
      name: trip.name || '',
      share_token: trip.share_token,
      owner_token: trip.owner_token || '',
      invite_token: trip.invite_token || '',
      trip_type: trip.trip_type || '',
      location: trip.location || '',
      description: trip.description || '',
      emergency_info: trip.emergency_info || '',
      start_date: trip.start_date || '',
      end_date: trip.end_date || '',
      expense_link: trip.expense_link || '',
      min_nights: trip.min_nights || 0,
      status: trip.status || 'confirmed',
      hidden_sections: trip.hidden_sections ?? [],
      join_policy: trip.join_policy || 'instant',
      invite_visibility: trip.invite_visibility || 'everyone',
      visibility: trip.visibility || 'private',
      immich_album_url: trip.immich_album_url || '',
      immich_album_linked: trip.immich_album_linked || false
    },
    members: await listMembers(pb, trip.id),
    pending: isOrganizer ? await listPending(pb, trip.id) : [],
    invites: isOrganizer ? await listInvites(pb, trip.id) : [],
    emailEnabled: isMailConfigured(),
    immichEnabled: await immichConfigured()
  };
}

export const actions = {
  // Clone this trip's scaffolding into a fresh planning-stage trip you own, then
  // land on it. Any member may clone. Mirrors the trip route's clone action
  // (kept here so the settings "Make a copy" button can redirect on success).
  clone: async ({ params, locals }) => {
    if (!locals.user) {
      throw redirect(303, `/login?next=${encodeURIComponent(`/${params.share_token}/settings`)}`);
    }
    const pb = await superuserPb();
    const trip = await fetchTrip(pb, params.share_token);
    const me = await getMembership(pb, trip.id, locals.user.id);
    if (!me || me.status === 'pending') return fail(403, { cloneError: 'Join this trip before cloning it.' });
    let token;
    try {
      token = await cloneTrip(pb, trip, locals.user, joinTrip);
    } catch (/** @type {any} */ e) {
      return fail(502, { cloneError: 'Could not clone the trip — please try again.' });
    }
    throw redirect(303, `/${token}`);
  }
};
