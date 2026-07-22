import { error, fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { loadTripByShareToken } from '$lib/server/loadTrip.js';
import { getMembership, joinTrip, listOrphans, listPending, listInvites, claimParticipant, findInvite, inviteTokenValid } from '$lib/server/membership.js';
import { isMailConfigured } from '$lib/server/mailer.js';
import { immichConfigured } from '$lib/server/immich.js';
import { tripTeaser } from '$lib/server/teaser.js';
import { tripOg, crawlerOg } from '$lib/server/og.js';
import { isCrawler } from '$lib/server/crawler.js';
import { loadPlanning } from '$lib/server/planning.js';
import { cloneTrip } from '$lib/server/cloneTrip.js';
import { listInvitableFriends, listTripInvitations } from '$lib/server/invitations.js';
import { mapApp } from '$lib/prefs.js';

/**
 * Resolve a trip row by share token, or throw the right HTTP error.
 * @param {any} pb superuser client
 * @param {string} shareToken
 */
async function fetchTrip(pb, shareToken) {
  try {
    return await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: shareToken }), {
        expand: 'picked_location' // the chosen idea, for the link-preview image
      });
  } catch (/** @type {any} */ err) {
    if (err?.status === 404) throw error(404, 'Trip not found');
    throw error(502, 'Could not reach the trip backend');
  }
}

/** Lowercased first word of a name. */
const firstWord = (/** @type {string} */ s) => String(s || '').trim().toLowerCase().split(/\s+/)[0] || '';

/**
 * Orphans worth offering to *this* user to claim: those whose name matches the
 * user's full or first name. An established member with a non-matching name sees
 * nothing (no nag about other people's name-only entries).
 * @param {Array<{ id: string, display_name: string }>} orphans
 * @param {string} userName
 */
function filterClaimable(orphans, userName) {
  const full = String(userName || '').trim().toLowerCase();
  if (!full) return [];
  const first = firstWord(full);
  return orphans.filter((o) => {
    const n = String(o.display_name || '').trim().toLowerCase();
    return n === full || n === first || firstWord(n) === first;
  });
}

export async function load({ params, locals, url, request }) {
  const pb = await superuserPb();
  const trip = await fetchTrip(pb, params.share_token);

  // Not signed in → trip links are private now that view-only sharing and joining
  // are split (#2). A link-preview crawler can't sign in, so hand it a sparse,
  // generic unfurl (trip name only, no details) instead of an ugly login redirect.
  // A real person gets sent to sign in, carrying the trip (and any invite token)
  // as `next` so we land them right back here; the check below then decides what
  // they see.
  if (!locals.user) {
    if (isCrawler(request.headers.get('user-agent'))) {
      return { crawler: true, og: crawlerOg(trip, url.origin) };
    }
    const invite = url.searchParams.get('invite');
    const dest = '/' + params.share_token + (invite ? `?invite=${encodeURIComponent(invite)}` : '');
    throw redirect(303, `/login?from=trip&next=${encodeURIComponent(dest)}`);
  }

  // Link-preview metadata. Computed from the trip row so it's identical for every
  // signed-in viewer; rendered in the page head.
  const og = await tripOg(pb, trip, url.origin);

  // Signed in but not a member → teaser. Joining now requires the invite link
  // (its `?invite=` carries the trip's invite_token) or a direct invitation
  // addressed to this account — the bare share link is view-only (#2). When they
  // can't join yet we still surface any name-only entry they can claim (they were
  // added by an organizer, so that's an implicit invite).
  const membership = await getMembership(pb, trip.id, locals.user.id);
  if (!membership) {
    const directInvite = await findInvite(pb, trip.id, locals.user.email);
    const canJoin = inviteTokenValid(trip, url.searchParams.get('invite')) || !!directInvite;
    return {
      invite: true,
      canJoin,
      inviteToken: url.searchParams.get('invite') ?? '',
      trip: tripTeaser(trip),
      orphans: await listOrphans(pb, trip.id),
      og
    };
  }

  // Joined under an approval-required trip → waiting for an organizer. No trip
  // data until approved (they aren't a member yet). Distinct from the organizer
  // `pending` array below (the approval queue).
  if (membership.status === 'pending') {
    return { awaitingApproval: true, trip: tripTeaser(trip), og };
  }

  const isOrganizer = membership.role === 'organizer';
  const membershipOut = { participantId: membership.id, role: membership.role || 'guest' };
  // The claim banner is only useful when an orphan might be a PRE-AUTH version of
  // *this* user — an established member shouldn't be nagged about other people's
  // name-only entries. Match on full or first name (case-insensitive).
  const allOrphans = await listOrphans(pb, trip.id);
  const orphans = filterClaimable(allOrphans, locals.user.name);
  // Approval queue, organizers only.
  const pending = isOrganizer ? await listPending(pb, trip.id) : [];
  // Outstanding invites, from both paths: email addresses (`invites`) and
  // in-app friend invitations (`trip_invitations`). Everyone on the trip sees
  // HOW MANY people are still to answer — that's half of "who's coming?" — but
  // only organizers see who, since an email address isn't the crew's business.
  const allInvites = await listInvites(pb, trip.id);
  const allTripInvitations = await listTripInvitations(pb, trip.id);
  const invitedCount = allInvites.length + allTripInvitations.length;
  const invites = isOrganizer ? allInvites : [];
  const tripInvitations = isOrganizer ? allTripInvitations : [];

  // Planning + idea ("someday") stages → the idea-gathering canvas (dates +
  // locations), not the full confirmed trip. An idea is a pre-planning trip;
  // "promote to trip" moves it idea → planning.
  const stage = trip.status || 'confirmed';
  if (stage === 'planning' || stage === 'idea') {
    const planning = await loadPlanning(pb, trip, membership.id);
    return {
      planning: true,
      trip: {
        id: trip.id,
        name: trip.name,
        share_token: trip.share_token,
        owner_token: trip.owner_token || '',
        invite_token: trip.invite_token || '',
        location: trip.location || '',
        description: trip.description || '',
        emergency_info: trip.emergency_info || '',
        trip_type: trip.trip_type || '',
        start_date: trip.start_date || '',
        end_date: trip.end_date || '',
        expense_link: trip.expense_link || '',
        status: stage,
        hidden_sections: [],
        join_policy: trip.join_policy || 'instant',
        invite_visibility: trip.invite_visibility || 'everyone',
        visibility: trip.visibility || 'private',
        min_nights: trip.min_nights || 0
      },
      membership: membershipOut,
      isOrganizer,
      ...planning,
      orphans,
      pending,
      invites,
      emailEnabled: isMailConfigured(),
      immichEnabled: await immichConfigured(),
      og
    };
  }

  // Confirmed / completed → full trip. Surface any unclaimed entries so a member
  // who came in under a fresh account can still merge into their pre-auth name.
  const data = await loadTripByShareToken(params.share_token, membership.id);
  // Friends you can invite in a tap (accepted friends not already on the trip).
  const invitableFriends = await listInvitableFriends(pb, locals.user.id, trip.id);
  return {
    ...data,
    status: trip.status || 'confirmed',
    mapApp: mapApp(locals.user), // which map app the Navigate links open
    membership: membershipOut,
    isOrganizer,
    orphans,
    pending,
    invites,
    invitableFriends,
    tripInvitations,
    invitedCount,
    emailEnabled: isMailConfigured(),
    immichEnabled: await immichConfigured(),
    og
  };
}

export const actions = {
  // Become a member of this trip. Requires being signed in AND a valid invite
  // capability: the invite token (carried in the join form / URL `?invite=`) or
  // a direct invitation addressed to this account. The bare share link alone is
  // view-only, so we re-check the capability server-side — not just in the UI.
  join: async ({ params, locals, request, url }) => {
    if (!locals.user) {
      throw redirect(303, `/login?next=${encodeURIComponent('/' + params.share_token)}`);
    }
    const pb = await superuserPb();
    const trip = await fetchTrip(pb, params.share_token);
    const fd = await request.formData();
    const token = String(fd.get('invite') ?? '') || url.searchParams.get('invite') || '';
    const directInvite = await findInvite(pb, trip.id, locals.user.email);
    if (!inviteTokenValid(trip, token) && !directInvite) {
      return fail(403, { joinError: 'You need an invite link to join this trip. Ask an organizer to send you one.' });
    }
    try {
      const m = await joinTrip(pb, trip, locals.user);
      // Approval-required trips return a pending membership; the page reloads
      // into the "waiting for approval" state on its own.
      return { joined: true, pending: m.status === 'pending' };
    } catch (/** @type {any} */ e) {
      return fail(502, { joinError: 'Could not join right now — please try again.' });
    }
  },

  // Withdraw a still-pending join request (removes the pending participant).
  withdraw: async ({ params, locals }) => {
    if (!locals.user) throw redirect(303, '/login');
    const pb = await superuserPb();
    const trip = await fetchTrip(pb, params.share_token);
    const m = await getMembership(pb, trip.id, locals.user.id);
    if (m && m.status === 'pending') {
      try {
        await pb.collection('participants').delete(m.id);
      } catch (/** @type {any} */ e) {
        return fail(502, { withdrawError: 'Could not withdraw — please try again.' });
      }
    }
    throw redirect(303, '/');
  },

  // Claim an existing name-only participant as yourself (merges any dup).
  claim: async ({ request, params, locals }) => {
    if (!locals.user) {
      throw redirect(303, `/login?next=${encodeURIComponent('/' + params.share_token)}`);
    }
    const fd = await request.formData();
    const orphanId = String(fd.get('participantId') ?? '');
    if (!orphanId) return fail(400, { claimError: 'Pick who you are.' });

    const pb = await superuserPb();
    const trip = await fetchTrip(pb, params.share_token);
    try {
      await claimParticipant(pb, trip, locals.user, orphanId);
    } catch (/** @type {any} */ e) {
      return fail(400, { claimError: e?.message || 'Could not claim that name.' });
    }
    return { claimed: true };
  },

  // Clone this trip's scaffolding into a fresh planning-stage trip you own, then
  // land on it. Any member may clone (it creates their own new trip).
  clone: async ({ params, locals }) => {
    if (!locals.user) {
      throw redirect(303, `/login?next=${encodeURIComponent('/' + params.share_token)}`);
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
