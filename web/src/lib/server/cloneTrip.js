// Clone a trip into a fresh one (#5): duplicate the structural scaffolding —
// gear list, packing recommendations, and meal slots — into a brand-new trip owned
// by the cloner, so a crew can re-run a trip without rebuilding the checklists.
//
// What carries over: trip details (name + " (copy)", type, location, the plan,
// emergency info, min-nights), gear_items, RECOMMENDED packing_items, and meal_slots
// (label only — dates reset, since the new trip re-picks them in planning).
// What does NOT: dates, members, RSVPs, gear claims, personal packs, meal sign-ups, expenses,
// and any planning-phase votes/ideas. The new trip starts in `planning`.

import { generateOwnerToken, generateInviteToken } from './tokens.js';
import { generateSlug } from './slug.js';

/**
 * @param {import('pocketbase').default} pb superuser client
 * @param {any} source the trip record being cloned
 * @param {{ id: string }} user the signed-in user (becomes organizer)
 * @param {(pb: any, trip: any, user: any) => Promise<any>} joinTrip membership helper
 * @returns {Promise<string>} the new trip's share token
 */
export async function cloneTrip(pb, source, user, joinTrip) {
  const base = {
    name: `${source.name} (copy)`.slice(0, 200),
    location: source.location || '',
    trip_type: source.trip_type || '',
    description: source.description || '',
    emergency_info: source.emergency_info || '',
    min_nights: source.min_nights || 0,
    start_date: '',
    end_date: '',
    expense_link: source.expense_link || '',
    owner_token: generateOwnerToken(),
    invite_token: generateInviteToken(),
    created_by: user.id,
    status: 'planning'
  };

  // Create with a unique slug — retry with more words on the rare collision.
  let trip;
  for (let attempt = 0; attempt < 6 && !trip; attempt++) {
    try {
      trip = await pb.collection('trips').create({ ...base, share_token: generateSlug(base.name, attempt + 1) });
    } catch (/** @type {any} */ err) {
      const collision = err?.status === 400 || err?.response?.data?.share_token;
      if (!(collision && attempt < 5)) throw err;
    }
  }
  if (!trip) throw new Error('Could not create the cloned trip');

  // The cloner is the organizer of the new trip.
  await joinTrip(pb, trip, user).catch(() => {});

  // Copy the structural lists in parallel; failures are non-fatal (the trip
  // already exists and the rest can be re-added by hand).
  const [gear, packing, slots] = await Promise.all([
    pb.collection('gear_items').getFullList({ filter: pb.filter('trip = {:t}', { t: source.id }) }).catch(() => []),
    pb.collection('packing_items').getFullList({ filter: pb.filter('trip = {:t}', { t: source.id }) }).catch(() => []),
    pb.collection('meal_slots').getFullList({ filter: pb.filter('trip = {:t}', { t: source.id }) }).catch(() => [])
  ]);

  const work = [];
  for (const g of gear) {
    // Note: gear_items.created_by is a relation to PARTICIPANTS, not users — and
    // the new trip's participants don't line up with the source's. Leave it unset
    // on a clone; the list itself is what carries over.
    work.push(
      pb.collection('gear_items').create({
        trip: trip.id,
        name: g.name,
        qty_needed: g.qty_needed || 1,
        category: g.category || '',
        notes: g.notes || ''
      })
    );
  }
  for (const p of packing) {
    // Only the organizer's recommendations carry over — personal packs belonged
    // to people who aren't on the new trip.
    if (!p.recommended) continue;
    work.push(
      pb.collection('packing_items').create({ trip: trip.id, label: p.label, recommended: true, checked: false })
    );
  }
  for (const s of slots) {
    work.push(
      pb.collection('meal_slots').create({ trip: trip.id, label: s.label, date: '', sort_order: s.sort_order || 0 })
    );
  }
  await Promise.all(work).catch(() => {});

  return trip.share_token;
}
