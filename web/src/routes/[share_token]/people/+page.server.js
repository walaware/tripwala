import { error, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { getMembership, listPending, listInvites } from '$lib/server/membership.js';
import { listTripInvitations } from '$lib/server/invitations.js';
import { isMailConfigured } from '$lib/server/mailer.js';
import { avatarUrl } from '$lib/server/userAvatar.js';

// Trip people — one home for everyone connected to the trip, whatever state
// they're in: on it and answered, on it and silent, waiting on approval, or
// invited and not joined yet. The compact "Who's in" card stays the at-a-glance
// view; this is where you actually manage it.

/**
 * Everyone on the trip with their status, richest first. Unlike loadTrip's
 * `members` this keeps name-only participants too — they're on the trip and
 * their RSVP counts, they just have no account behind them.
 *
 * @param {any} pb superuser client
 * @param {string} tripId
 */
async function listCrew(pb, tripId) {
  const rows = await pb.collection('participants').getFullList({
    filter: pb.filter('trip = {:t}', { t: tripId }),
    expand: 'user',
    sort: 'display_name'
  });
  return rows
    .filter((/** @type {any} */ p) => p.status !== 'pending')
    .map((/** @type {any} */ p) => ({
      id: p.id,
      display_name: p.display_name,
      rsvp_status: p.rsvp_status ?? null,
      lean: p.lean || 0,
      role: p.role || 'guest',
      avatar: avatarUrl(p.expand?.user),
      hasAccount: Boolean(p.user)
    }));
}

export async function load({ params, locals }) {
  if (!locals.user) throw redirect(303, `/login?next=/${params.share_token}/people`);

  const pb = await superuserPb();
  const trip = await pb
    .collection('trips')
    .getFirstListItem(pb.filter('share_token = {:t}', { t: params.share_token }))
    .catch(() => null);
  if (!trip) throw error(404, 'Trip not found');

  // Same rule as the trip page: only active members see the crew at all.
  const membership = await getMembership(pb, trip.id, locals.user.id);
  if (!membership || membership.status === 'pending') throw redirect(303, `/${params.share_token}`);

  const isOrganizer = membership.role === 'organizer';
  const [crew, pending, invites, tripInvitations] = await Promise.all([
    listCrew(pb, trip.id),
    isOrganizer ? listPending(pb, trip.id) : Promise.resolve([]),
    isOrganizer ? listInvites(pb, trip.id) : Promise.resolve([]),
    isOrganizer ? listTripInvitations(pb, trip.id) : Promise.resolve([])
  ]);

  return {
    shareToken: params.share_token,
    trip: { name: trip.name, invite_visibility: trip.invite_visibility || 'everyone' },
    currentParticipantId: membership.id,
    isOrganizer,
    crew,
    // Members-and-roles list is account-linked only (you can't change the role of
    // a name-only entry), organizers first.
    members: crew
      .filter((/** @type {any} */ p) => p.hasAccount)
      .map((/** @type {any} */ p) => ({ id: p.id, display_name: p.display_name, role: p.role }))
      .sort((/** @type {any} */ a, /** @type {any} */ b) =>
        a.role === b.role ? 0 : a.role === 'organizer' ? -1 : 1
      ),
    pending,
    invites,
    tripInvitations,
    emailEnabled: isMailConfigured()
  };
}
