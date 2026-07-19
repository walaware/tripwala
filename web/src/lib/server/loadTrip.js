import { error } from '@sveltejs/kit';
import { superuserPb } from './pocketbase.js';
import { settleUp } from './settle.js';
import { avatarUrl } from './userAvatar.js';
import { locationImageUrl } from './locationMedia.js';
import { participantName } from '../displayName.js';
import { shapeItinerary } from './itinerary.js';

/**
 * Load a trip and all of its related sections by share token.
 * Returns a plain, serializable object for the page.
 *
 * NOTE (security boundary, build-sequence step 9): this reads any trip whose
 * share_token is known. That is the intended capability model — the token is
 * the secret. What is NOT yet enforced is that a participant can only *write*
 * to their own trip's rows; collection API rules are currently open. Harden
 * before exposing write paths publicly.
 *
 * @param {string} shareToken
 * @param {string|null} currentParticipantId  the viewer's participant, for their own vote state
 */
export async function loadTripByShareToken(shareToken, currentParticipantId = null) {
  const pb = await superuserPb();

  let trip;
  try {
    trip = await pb.collection('trips').getFirstListItem(
      pb.filter('share_token = {:token}', { token: shareToken }),
      { expand: 'picked_location' } // the chosen idea, so we can show its picture
    );
  } catch (/** @type {any} */ err) {
    if (err?.status === 404) throw error(404, 'Trip not found');
    throw error(502, 'Could not reach the trip backend');
  }

  const tripFilter = pb.filter('trip = {:id}', { id: trip.id });

  const [participantsAll, gearItems, gearClaims, mealSlots, mealSignups, packingItems, expenseRows, itineraryRows, itineraryVotes, mapPinRows] =
    await Promise.all([
      pb.collection('participants').getFullList({ filter: tripFilter, sort: 'created', expand: 'user' }),
      pb.collection('gear_items').getFullList({ filter: tripFilter, sort: 'created' }),
      pb
        .collection('gear_claims')
        .getFullList({ filter: pb.filter('gear_item.trip = {:id}', { id: trip.id }) }),
      pb.collection('meal_slots').getFullList({ filter: tripFilter, sort: 'sort_order' }),
      pb
        .collection('meal_signups')
        .getFullList({ filter: pb.filter('meal_slot.trip = {:id}', { id: trip.id }) }),
      pb.collection('packing_items').getFullList({ filter: tripFilter, sort: 'created' }),
      pb.collection('expenses').getFullList({ filter: tripFilter, sort: '-created' }),
      pb.collection('itinerary_items').getFullList({ filter: tripFilter, sort: 'date,sort_order' }),
      // item-level votes are newer than some deployments' data; tolerate absence.
      pb.collection('itinerary_votes').getFullList({ filter: pb.filter('itinerary_item.trip = {:id}', { id: trip.id }) }).catch(() => []),
      // map_pins is newer than some deployments' data; tolerate its absence.
      pb.collection('map_pins').getFullList({ filter: tripFilter, sort: 'created' }).catch(() => [])
    ]);

  // Pending link-join requests aren't members yet — keep them out of every
  // visible list (crew, members, counts). Organizers see them in the approval
  // queue, loaded separately.
  const participants = participantsAll.filter((p) => p.status !== 'pending');

  /** @type {Record<string, string>} */
  const nameById = Object.fromEntries(participants.map((p) => [p.id, participantName(p)]));
  /** @type {Record<string, string>} */
  const avatarById = Object.fromEntries(participants.map((p) => [p.id, avatarUrl(p.expand?.user) || '']));

  // gear remaining = qty_needed - sum(claims)
  /** @type {Record<string, Array<{id: string, participant: string, participantName: string, qty_claimed: number}>>} */
  const claimsByItem = {};
  for (const c of gearClaims) {
    (claimsByItem[c.gear_item] ??= []).push({
      id: c.id,
      participant: c.participant,
      participantName: nameById[c.participant] ?? 'Someone',
      qty_claimed: c.qty_claimed ?? 1
    });
  }
  const gear = gearItems.map((g) => {
    const claims = claimsByItem[g.id] ?? [];
    const claimed = claims.reduce((sum, c) => sum + (c.qty_claimed ?? 1), 0);
    const needed = g.qty_needed ?? 1;
    return {
      id: g.id,
      name: g.name,
      category: g.category,
      notes: g.notes,
      qty_needed: needed,
      claimed,
      remaining: Math.max(0, needed - claimed),
      claims
    };
  });

  // Owner + helpers per slot. The owner (is_owner) sets the dish; others help.
  /** @type {Record<string, any[]>} */
  const signupsBySlot = {};
  for (const s of mealSignups) {
    (signupsBySlot[s.meal_slot] ??= []).push(s);
  }
  const meals = mealSlots.map((m) => {
    const ss = signupsBySlot[m.id] ?? [];
    const ownerRec = ss.find((s) => s.is_owner) ?? null;
    const helpers = ss
      .filter((s) => !s.is_owner)
      .map((s) => ({ participant: s.participant, name: nameById[s.participant] ?? 'Someone' }));
    return {
      id: m.id,
      label: m.label,
      date: m.date,
      ownerParticipant: ownerRec ? ownerRec.participant : null,
      ownerName: ownerRec ? (nameById[ownerRec.participant] ?? 'Someone') : null,
      dish: ownerRec ? (ownerRec.dish_note || '') : '',
      helpers
    };
  });

  // Expenses → rows (with payer name) + an equal-split settle-up across members.
  const expenses = expenseRows.map((e) => ({
    id: e.id,
    title: e.title,
    amount: e.amount,
    paidBy: e.paid_by,
    paidByName: e.paid_by ? (nameById[e.paid_by] ?? 'Someone') : 'Someone'
  }));
  const settlement = settleUp(
    expenseRows.map((e) => ({ amount: e.amount, paid_by: e.paid_by })),
    participants.map((p) => ({ id: p.id, display_name: p.display_name }))
  );

  // Itinerary → day-by-day items: fixed schedule entries + flexible suggestions
  // the crew upvotes (the viewer's own vote flagged via `mine`).
  const itineraryItems = shapeItinerary(itineraryRows, itineraryVotes, nameById, avatarById, currentParticipantId);

  // The picked location idea (if any) carries its image + link preview into the
  // confirmed trip, for the expanded location card. Custom image wins over the
  // unfurled og:image, same as the planning cards.
  const pickedIdea = trip.expand?.picked_location || null;
  const pickedLocation = pickedIdea
    ? {
        id: pickedIdea.id,
        label: pickedIdea.label || '',
        url: pickedIdea.url || '',
        note: pickedIdea.note || '',
        image: locationImageUrl(pickedIdea, '1000x0'), // hero-sized thumb, aspect preserved
        previewImage: pickedIdea.preview_image || '',
        previewTitle: pickedIdea.preview_title || '',
        previewDescription: pickedIdea.preview_description || ''
      }
    : null;

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      location: trip.location,
      pickedLocation,
      start_date: trip.start_date,
      end_date: trip.end_date,
      description: trip.description,
      emergency_info: trip.emergency_info || '',
      expense_link: trip.expense_link,
      share_token: trip.share_token,
      owner_token: trip.owner_token || '',
      invite_token: trip.invite_token || '',
      trip_type: trip.trip_type || '',
      status: trip.status || 'confirmed',
      hidden_sections: Array.isArray(trip.hidden_sections) ? trip.hidden_sections : [],
      join_policy: trip.join_policy || 'instant',
      invite_visibility: trip.invite_visibility || 'everyone',
      visibility: trip.visibility || 'private',
      min_nights: trip.min_nights || 0,
      immich_album_url: trip.immich_album_url || '',
      // Whether an app-created album (id known → name stays in sync) vs a
      // manually-linked one (embed only). The url itself is the secret, fine to
      // ship; we only expose a boolean for the id.
      immich_album_linked: Boolean(trip.immich_album_id)
    },
    // Account-linked members (for the inline Trip-settings members list).
    members: participants
      .filter((p) => p.user)
      .map((p) => ({ id: p.id, display_name: participantName(p), role: p.role || 'guest' }))
      .sort((a, b) => (a.role === b.role ? 0 : a.role === 'organizer' ? -1 : 1)),
    participants: participants
      .map((p) => ({
        id: p.id,
        display_name: participantName(p),
        rsvp_status: p.rsvp_status,
        lean: p.lean || 0,
        notify: p.notify !== false, // per-member trip-notification preference (default on)
        dietary: p.dietary || '', // allergies / preferences, shown to cooks
        arrival: p.arrival || '', // live check-in: '' | not_left | en_route | arrived
        avatar: avatarUrl(p.expand?.user) // Google photo if the member has an account
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })),
    gear,
    meals,
    packing: packingItems.map((p) => ({
      id: p.id,
      label: p.label,
      is_shared: p.is_shared,
      checked: p.checked,
      participant: p.participant,
      participantName: p.participant ? (nameById[p.participant] ?? 'Someone') : null,
      from_gear: p.from_gear || null
    })),
    expenses,
    settlement,
    itineraryItems,
    mapPins: mapPinRows.map((p) => ({
      id: p.id,
      label: p.label,
      category: p.category || 'other',
      lat: p.lat,
      lng: p.lng,
      note: p.note || '',
      createdBy: p.created_by || null,
      createdByName: p.created_by ? (nameById[p.created_by] ?? 'Someone') : null
    }))
  };
}
