import { json, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';

// All trip mutations funnel through here. PocketBase collection rules are locked
// to superuser-only, so the browser cannot write directly — it POSTs an op to
// this endpoint, which (1) resolves the trip from the URL's share_token and
// (2) verifies every target row belongs to THAT trip before acting. This is
// what enforces per-trip scoping in the no-account model: you can't touch
// another trip's data even though there are no user accounts.
//
// Within a trip, identity is still claim-based/trusted (no passwords) — that's
// the product's intended model, not a gap.

export async function POST({ params, request }) {
  const pb = await superuserPb();

  /** @type {any} */
  let trip;
  try {
    trip = await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: params.share_token }));
  } catch (/** @type {any} */ e) {
    throw error(404, 'Trip not found');
  }

  const body = await request.json().catch(() => ({}));
  const op = String(body.op ?? '');

  /** Fetch a row and assert it belongs to this trip (via its `trip` field). */
  async function inTrip(/** @type {string} */ coll, /** @type {string} */ id) {
    const rec = await pb.collection(coll).getOne(id);
    if (rec.trip !== trip.id) throw error(403, 'That item is not part of this trip');
    return rec;
  }

  /** @param {string} coll @param {string} filter */
  async function firstOrNull(coll, filter) {
    const res = await pb.collection(coll).getList(1, 1, { filter });
    return res.items[0] ?? null;
  }

  try {
    switch (op) {
      case 'rsvp': {
        const p = await inTrip('participants', body.participantId);
        await pb.collection('participants').update(p.id, { rsvp_status: body.status });
        break;
      }

      case 'gear_add': {
        const name = String(body.name ?? '').trim().slice(0, 200);
        if (!name) throw error(400, 'Name required');
        /** @type {Record<string, unknown>} */
        const data = { trip: trip.id, name, qty_needed: 1 };
        if (body.participantId) {
          await inTrip('participants', body.participantId);
          data.created_by = body.participantId;
        }
        await pb.collection('gear_items').create(data);
        break;
      }

      case 'claim': {
        const g = await inTrip('gear_items', body.gearItemId);
        const p = await inTrip('participants', body.participantId);
        const claims = await pb
          .collection('gear_claims')
          .getFullList({ filter: pb.filter('gear_item = {:g}', { g: g.id }) });
        const claimed = claims.reduce((s, c) => s + (c.qty_claimed || 1), 0);
        const remaining = Math.max(1, (g.qty_needed || 1) - claimed);
        await pb
          .collection('gear_claims')
          .create({ gear_item: g.id, participant: p.id, qty_claimed: remaining });
        // Auto-add to claimer's packing list (dedupe-guarded).
        const existing = await firstOrNull(
          'packing_items',
          pb.filter('from_gear = {:g} && participant = {:p}', { g: g.id, p: p.id })
        );
        if (!existing) {
          await pb.collection('packing_items').create({
            trip: trip.id,
            participant: p.id,
            label: g.name,
            is_shared: false,
            checked: false,
            from_gear: g.id
          });
        }
        break;
      }

      case 'release': {
        const g = await inTrip('gear_items', body.gearItemId);
        const mine = await firstOrNull(
          'gear_claims',
          pb.filter('gear_item = {:g} && participant = {:p}', { g: g.id, p: body.participantId })
        );
        if (mine) await pb.collection('gear_claims').delete(mine.id);
        const linked = await firstOrNull(
          'packing_items',
          pb.filter('from_gear = {:g} && participant = {:p}', { g: g.id, p: body.participantId })
        );
        if (linked) await pb.collection('packing_items').delete(linked.id);
        break;
      }

      // Become the owner of a meal nobody's taken yet (optionally with a dish).
      case 'meal_take': {
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const p = await inTrip('participants', body.participantId);
        const owner = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && is_owner = true', { s: slot.id })
        );
        if (owner) break; // already owned — no-op
        // if I'm already a helper, promote me; else create as owner
        const existing = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: p.id })
        );
        const dish = String(body.dish ?? '').slice(0, 300);
        if (existing) {
          await pb.collection('meal_signups').update(existing.id, { is_owner: true, dish_note: dish });
        } else {
          await pb
            .collection('meal_signups')
            .create({ meal_slot: slot.id, participant: p.id, is_owner: true, dish_note: dish });
        }
        break;
      }

      // Join an already-owned meal as a helper.
      case 'meal_help': {
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const p = await inTrip('participants', body.participantId);
        const existing = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: p.id })
        );
        if (!existing) {
          await pb
            .collection('meal_signups')
            .create({ meal_slot: slot.id, participant: p.id, is_owner: false, dish_note: '' });
        }
        break;
      }

      // Owner sets the dish (what's being made).
      case 'meal_dish': {
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const mine = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: body.participantId })
        );
        if (mine && mine.is_owner) {
          await pb
            .collection('meal_signups')
            .update(mine.id, { dish_note: String(body.dish ?? '').slice(0, 300) });
        }
        break;
      }

      // Leave a meal. If the owner leaves, the meal resets (everyone removed).
      case 'meal_drop': {
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const mine = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: body.participantId })
        );
        if (!mine) break;
        if (mine.is_owner) {
          const all = await pb
            .collection('meal_signups')
            .getFullList({ filter: pb.filter('meal_slot = {:s}', { s: slot.id }) });
          for (const su of all) await pb.collection('meal_signups').delete(su.id);
        } else {
          await pb.collection('meal_signups').delete(mine.id);
        }
        break;
      }

      case 'pack_toggle': {
        const item = await inTrip('packing_items', body.itemId);
        await pb.collection('packing_items').update(item.id, { checked: !item.checked });
        break;
      }

      case 'pack_add': {
        const label = String(body.label ?? '').trim().slice(0, 200);
        if (!label) throw error(400, 'Label required');
        const isShared = !!body.isShared;
        if (!isShared && body.participantId) await inTrip('participants', body.participantId);
        await pb.collection('packing_items').create({
          trip: trip.id,
          label,
          is_shared: isShared,
          checked: false,
          participant: isShared ? null : (body.participantId ?? null)
        });
        break;
      }

      default:
        throw error(400, 'Unknown action');
    }
  } catch (/** @type {any} */ e) {
    if (e?.status) throw e;
    throw error(500, 'Action failed');
  }

  return json({ ok: true });
}
