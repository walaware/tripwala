import { error } from '@sveltejs/kit';
import { superuserPb } from './pocketbase.js';

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
 */
export async function loadTripByShareToken(shareToken) {
  const pb = await superuserPb();

  let trip;
  try {
    trip = await pb.collection('trips').getFirstListItem(
      pb.filter('share_token = {:token}', { token: shareToken })
    );
  } catch (/** @type {any} */ err) {
    if (err?.status === 404) throw error(404, 'Trip not found');
    throw error(502, 'Could not reach the trip backend');
  }

  const tripFilter = pb.filter('trip = {:id}', { id: trip.id });

  const [participants, gearItems, gearClaims, mealSlots, mealSignups, packingItems] =
    await Promise.all([
      pb.collection('participants').getFullList({ filter: tripFilter, sort: 'created' }),
      pb.collection('gear_items').getFullList({ filter: tripFilter, sort: 'created' }),
      pb
        .collection('gear_claims')
        .getFullList({ filter: pb.filter('gear_item.trip = {:id}', { id: trip.id }) }),
      pb.collection('meal_slots').getFullList({ filter: tripFilter, sort: 'sort_order' }),
      pb
        .collection('meal_signups')
        .getFullList({ filter: pb.filter('meal_slot.trip = {:id}', { id: trip.id }) }),
      pb.collection('packing_items').getFullList({ filter: tripFilter, sort: 'created' })
    ]);

  /** @type {Record<string, string>} */
  const nameById = Object.fromEntries(participants.map((p) => [p.id, p.display_name]));

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

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      location: trip.location,
      start_date: trip.start_date,
      end_date: trip.end_date,
      description: trip.description,
      expense_link: trip.expense_link,
      share_token: trip.share_token
    },
    participants: participants
      .map((p) => ({
        id: p.id,
        display_name: p.display_name,
        rsvp_status: p.rsvp_status
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
    }))
  };
}
