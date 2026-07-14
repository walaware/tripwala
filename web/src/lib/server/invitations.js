// User-targeted trip invitations (#30, Surface A). Distinct from the email-keyed
// `invites` collection: here you pick a friend (a known account) and the invite
// lands on their dashboard as Accept / Decline. Accepting routes through the
// existing joinTrip() so membership creation, orphan-adoption, and role all stay
// in one place. All reads/writes are superuser-mediated and scoped to the
// signed-in user server-side.

import { avatarUrl } from './userAvatar.js';
import { displayName } from '../displayName.js';
import { getMembership, joinTrip } from './membership.js';
import { areFriends, listFriends } from './friends.js';
import { raise, resolve } from './notifications.js';

/**
 * My accepted friends who aren't already on this trip (members or already
 * invited) — the candidates for the trip's "Invite friends" picker.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @param {string} tripId
 * @returns {Promise<Array<{ id: string, name: string, avatar?: string }>>}
 */
export async function listInvitableFriends(pb, userId, tripId) {
  const friends = await listFriends(pb, userId);
  if (!friends.length) return [];

  const members = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('trip = {:t}', { t: tripId }) });
  const invited = await pb
    .collection('trip_invitations')
    .getFullList({ filter: pb.filter('trip = {:t} && status = "pending"', { t: tripId }) });

  const taken = new Set([
    ...members.map((m) => m.user).filter(Boolean),
    ...invited.map((i) => i.user)
  ]);
  return friends.filter((f) => !taken.has(f.id));
}

/**
 * Invite a friend to a trip. Guards: the inviter must be an active member; the
 * invitee must be an accepted friend of the inviter (unless the inviter is an
 * organizer — they may invite anyone they can reach) and not already a
 * participant. Upserts one pending row per (trip, user).
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ id: string }} trip
 * @param {{ id: string, user?: string, role?: string }} inviterMembership the inviter's participant row
 * @param {string} inviteeUserId
 * @param {string} [role] 'guest' | 'organizer'
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function inviteFriendToTrip(pb, trip, inviterMembership, inviteeUserId, role = 'guest') {
  const inviterUserId = inviterMembership && inviterMembership.user;
  if (!inviterUserId || !inviteeUserId) return { ok: false, reason: 'bad_request' };
  if (inviterUserId === inviteeUserId) return { ok: false, reason: 'self' };

  const isOrganizer = inviterMembership.role === 'organizer';
  // Only organizers can grant an organizer role via an invite.
  const grantRole = isOrganizer && role === 'organizer' ? 'organizer' : 'guest';

  // Guests may only invite people they're already friends with (this also blocks
  // using invites to probe whether an account exists). Organizers are trusted.
  if (!isOrganizer && !(await areFriends(pb, inviterUserId, inviteeUserId))) {
    return { ok: false, reason: 'not_friends' };
  }

  // Already a member? Nothing to do.
  const already = await getMembership(pb, trip.id, inviteeUserId);
  if (already) return { ok: false, reason: 'already_member' };

  // Upsert one invitation per (trip, user).
  const existing = await pb
    .collection('trip_invitations')
    .getList(1, 1, {
      filter: pb.filter('trip = {:t} && user = {:u}', { t: trip.id, u: inviteeUserId })
    });
  let invitationId;
  if (existing.items[0]) {
    invitationId = existing.items[0].id;
    await pb.collection('trip_invitations').update(invitationId, {
      status: 'pending',
      role: grantRole,
      invited_by: inviterUserId
    });
  } else {
    const created = await pb.collection('trip_invitations').create({
      trip: trip.id,
      user: inviteeUserId,
      invited_by: inviterUserId,
      role: grantRole,
      status: 'pending'
    });
    invitationId = created.id;
  }
  // Land it on the invitee's bell as an actionable item.
  await raise(pb, {
    user: inviteeUserId,
    type: 'trip_invitation',
    actor: inviterUserId,
    trip: trip.id,
    ref: invitationId
  });
  return { ok: true };
}

/**
 * Pending trip invitations addressed to a user, for the dashboard. Each carries
 * the trip headline + who invited them.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 */
export async function listMyInvitations(pb, userId) {
  if (!userId) return [];
  const rows = await pb.collection('trip_invitations').getFullList({
    filter: pb.filter('user = {:u} && status = "pending"', { u: userId }),
    expand: 'trip,invited_by',
    sort: '-created'
  });
  return rows
    .filter((r) => r.expand?.trip)
    .map((r) => {
      const t = r.expand?.trip;
      const by = r.expand?.invited_by;
      return {
        id: r.id,
        role: r.role || 'guest',
        trip: {
          name: t?.name ?? '',
          location: t?.location ?? '',
          start_date: t?.start_date ?? '',
          end_date: t?.end_date ?? ''
        },
        invitedBy: by ? displayName(by.name || '', by) : null,
        invitedByAvatar: avatarUrl(by)
      };
    });
}

/**
 * Accept an invitation addressed to me: join the trip (granting the stored role,
 * bypassing approval) and mark the row accepted.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ id: string, name: string, email?: string }} user the signed-in user
 * @param {string} invitationId
 */
export async function acceptInvitation(pb, user, invitationId) {
  const inv = await pb.collection('trip_invitations').getOne(invitationId, { expand: 'trip' });
  if (inv.user !== user.id) throw new Error('Not your invitation');
  const trip = inv.expand?.trip ?? (await pb.collection('trips').getOne(inv.trip));
  await joinTrip(pb, trip, user, {
    grantRole: inv.role === 'organizer' ? 'organizer' : 'guest',
    skipApproval: true
  });
  await pb.collection('trip_invitations').update(invitationId, { status: 'accepted' });
  await resolve(pb, { user: user.id, type: 'trip_invitation', ref: invitationId });
  return { share_token: trip.share_token };
}

/**
 * Decline an invitation addressed to me.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @param {string} invitationId
 */
export async function declineInvitation(pb, userId, invitationId) {
  const inv = await pb.collection('trip_invitations').getOne(invitationId);
  if (inv.user !== userId) throw new Error('Not your invitation');
  await pb.collection('trip_invitations').update(invitationId, { status: 'declined' });
  await resolve(pb, { user: userId, type: 'trip_invitation', ref: invitationId });
}

/**
 * Outstanding invitations on a trip (shown to organizers so they can see who's
 * been asked and revoke).
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} tripId
 */
export async function listTripInvitations(pb, tripId) {
  const rows = await pb.collection('trip_invitations').getFullList({
    filter: pb.filter('trip = {:t} && status = "pending"', { t: tripId }),
    expand: 'user',
    sort: '-created'
  });
  /** @type {Array<{ id: string, name: string, avatar?: string, role: string }>} */
  const out = [];
  for (const r of rows) {
    const u = r.expand?.user;
    if (!u) continue;
    out.push({ id: r.id, name: displayName(u.name || '', u), avatar: avatarUrl(u), role: r.role || 'guest' });
  }
  return out;
}
