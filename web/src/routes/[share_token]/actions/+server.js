import { json, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { getMembership } from '$lib/server/membership.js';
import { isMailConfigured, sendInviteEmail } from '$lib/server/mailer.js';

// All trip mutations funnel through here. PocketBase collection rules are locked
// to superuser-only, so the browser cannot write directly — it POSTs an op to
// this endpoint, which (1) resolves the trip from the URL's share_token,
// (2) requires the signed-in user to be a MEMBER of that trip, and (3) verifies
// every target row belongs to that trip before acting.
//
// Identity is now authenticated: the acting participant is derived from the
// signed-in user's membership, not trusted from the client. A member acts as
// themselves; only organizers may act on another participant (e.g. setting
// someone else's RSVP).

export async function POST({ params, request, locals, url }) {
  if (!locals.user) throw error(401, 'Sign in to make changes');

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

  const me = /** @type {any} */ (await getMembership(pb, trip.id, locals.user.id));
  if (!me) throw error(403, 'Join this trip before making changes');
  // A pending (unapproved) link-join can't see or act on the trip yet. They can
  // still withdraw via the route's ?/withdraw action.
  if (me.status === 'pending') throw error(403, 'Your request to join is awaiting approval');
  const isOrganizer = me.role === 'organizer';

  const body = await request.json().catch(() => ({}));
  const op = String(body.op ?? '');

  /** Fetch a row and assert it belongs to this trip (via its `trip` field). */
  async function inTrip(/** @type {string} */ coll, /** @type {string} */ id) {
    const rec = await pb.collection(coll).getOne(id);
    if (rec.trip !== trip.id) throw error(403, 'That item is not part of this trip');
    return rec;
  }

  /**
   * The participant an op acts on. Defaults to the signed-in member; an explicit
   * different participant is allowed only for organizers (e.g. owner-set RSVP).
   */
  async function targetParticipant() {
    if (body.participantId && body.participantId !== me.id) {
      if (!isOrganizer) throw error(403, 'Only organizers can change other people');
      return inTrip('participants', body.participantId);
    }
    return me;
  }

  /** @param {string} coll @param {string} filter */
  async function firstOrNull(coll, filter) {
    const res = await pb.collection(coll).getList(1, 1, { filter });
    return res.items[0] ?? null;
  }

  try {
    switch (op) {
      case 'rsvp': {
        const p = await targetParticipant();
        /** @type {Record<string, unknown>} */
        const data = { rsvp_status: body.status };
        // Lean only applies to "maybe": default to 50/50 on first maybe, clear otherwise.
        if (body.status === 'maybe') {
          if (!p.lean) data.lean = 2;
        } else {
          data.lean = null;
        }
        await pb.collection('participants').update(p.id, data);
        break;
      }

      // Set how flaky a "maybe" is (1 long shot · 2 fifty-fifty · 3 leaning yes).
      case 'lean': {
        const p = await targetParticipant();
        const lean = Math.max(1, Math.min(3, Number(body.lean) || 2));
        await pb.collection('participants').update(p.id, { lean, rsvp_status: 'maybe' });
        break;
      }

      case 'gear_add': {
        // Accept one (`name`) or many (`names`), e.g. a pasted list.
        const raw = Array.isArray(body.names) ? body.names : [body.name];
        const names = raw.map((/** @type {any} */ n) => String(n ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 50);
        if (!names.length) throw error(400, 'Name required');
        for (const name of names) {
          await pb.collection('gear_items').create({ trip: trip.id, name, qty_needed: 1, created_by: me.id });
        }
        break;
      }

      case 'claim': {
        const g = await inTrip('gear_items', body.gearItemId);
        const claims = await pb
          .collection('gear_claims')
          .getFullList({ filter: pb.filter('gear_item = {:g}', { g: g.id }) });
        const claimed = claims.reduce((s, c) => s + (c.qty_claimed || 1), 0);
        const remaining = Math.max(1, (g.qty_needed || 1) - claimed);
        await pb
          .collection('gear_claims')
          .create({ gear_item: g.id, participant: me.id, qty_claimed: remaining });
        // Auto-add to claimer's packing list (dedupe-guarded).
        const existing = await firstOrNull(
          'packing_items',
          pb.filter('from_gear = {:g} && participant = {:p}', { g: g.id, p: me.id })
        );
        if (!existing) {
          await pb.collection('packing_items').create({
            trip: trip.id,
            participant: me.id,
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
          pb.filter('gear_item = {:g} && participant = {:p}', { g: g.id, p: me.id })
        );
        if (mine) await pb.collection('gear_claims').delete(mine.id);
        const linked = await firstOrNull(
          'packing_items',
          pb.filter('from_gear = {:g} && participant = {:p}', { g: g.id, p: me.id })
        );
        if (linked) await pb.collection('packing_items').delete(linked.id);
        break;
      }

      // Become the owner of a meal nobody's taken yet (optionally with a dish).
      case 'meal_take': {
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const owner = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && is_owner = true', { s: slot.id })
        );
        if (owner) break; // already owned — no-op
        const existing = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: me.id })
        );
        const dish = String(body.dish ?? '').slice(0, 300);
        if (existing) {
          await pb.collection('meal_signups').update(existing.id, { is_owner: true, dish_note: dish });
        } else {
          await pb
            .collection('meal_signups')
            .create({ meal_slot: slot.id, participant: me.id, is_owner: true, dish_note: dish });
        }
        break;
      }

      // Join an already-owned meal as a helper.
      case 'meal_help': {
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const existing = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: me.id })
        );
        if (!existing) {
          await pb
            .collection('meal_signups')
            .create({ meal_slot: slot.id, participant: me.id, is_owner: false, dish_note: '' });
        }
        break;
      }

      // Owner sets the dish (what's being made).
      case 'meal_dish': {
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const mine = await firstOrNull(
          'meal_signups',
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: me.id })
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
          pb.filter('meal_slot = {:s} && participant = {:p}', { s: slot.id, p: me.id })
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

      // Add a meal slot (organizer only). `label` is the meal name (e.g. "Dinner");
      // `date` is an optional YYYY-MM-DD that buckets it under a day.
      case 'meal_slot_add': {
        if (!isOrganizer) throw error(403, 'Only organizers can edit meals');
        const label = String(body.label ?? '').trim().slice(0, 80);
        if (!label) throw error(400, 'Name the meal');
        const date = String(body.date ?? '').slice(0, 10);
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw error(400, 'Bad date');
        const count = (
          await pb.collection('meal_slots').getList(1, 1, { filter: pb.filter('trip = {:t}', { t: trip.id }) })
        ).totalItems;
        await pb.collection('meal_slots').create({
          trip: trip.id,
          label,
          date: date ? `${date} 00:00:00.000Z` : '',
          sort_order: count
        });
        break;
      }

      // Remove a meal slot + its sign-ups (organizer only).
      case 'meal_slot_remove': {
        if (!isOrganizer) throw error(403, 'Only organizers can edit meals');
        const slot = await inTrip('meal_slots', body.mealSlotId);
        const signups = await pb
          .collection('meal_signups')
          .getFullList({ filter: pb.filter('meal_slot = {:s}', { s: slot.id }) })
          .catch(() => []);
        for (const su of signups) await pb.collection('meal_signups').delete(su.id).catch(() => {});
        await pb.collection('meal_slots').delete(slot.id);
        break;
      }

      case 'pack_toggle': {
        const item = await inTrip('packing_items', body.itemId);
        // Anyone can tick a shared item; a personal item only by its owner (or an organizer).
        if (!item.is_shared && item.participant && item.participant !== me.id && !isOrganizer) {
          throw error(403, "That's someone else's packing item");
        }
        await pb.collection('packing_items').update(item.id, { checked: !item.checked });
        break;
      }

      case 'pack_add': {
        // Accept one (`label`) or many (`labels`), e.g. a pasted list.
        const raw = Array.isArray(body.labels) ? body.labels : [body.label];
        const labels = raw.map((/** @type {any} */ l) => String(l ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 50);
        if (!labels.length) throw error(400, 'Label required');
        const isShared = !!body.isShared;
        for (const label of labels) {
          await pb.collection('packing_items').create({
            trip: trip.id,
            label,
            is_shared: isShared,
            checked: false,
            participant: isShared ? null : me.id
          });
        }
        break;
      }

      // Log a shared cost. Anyone in the trip can add one; the payer defaults to
      // the actor but an organizer may attribute it to someone else.
      case 'expense_add': {
        const title = String(body.title ?? '').trim().slice(0, 200);
        const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
        if (!title) throw error(400, 'What was it for?');
        if (!(amount > 0)) throw error(400, 'Amount must be greater than zero');
        let payer = me;
        if (body.paidBy && body.paidBy !== me.id) {
          payer = await inTrip('participants', body.paidBy); // verifies it's this trip's member
        }
        await pb.collection('expenses').create({ trip: trip.id, title, amount, paid_by: payer.id });
        break;
      }

      // Remove an expense (the payer or an organizer).
      case 'expense_delete': {
        const e = await inTrip('expenses', body.expenseId);
        if (e.paid_by !== me.id && !isOrganizer) throw error(403, 'Only the payer or an organizer can remove this');
        await pb.collection('expenses').delete(e.id);
        break;
      }

      // Set (or clear) the day-plan label for one date. Organizers own the plan.
      case 'itinerary_set': {
        if (!isOrganizer) throw error(403, 'Only organizers can edit the plan');
        const date = String(body.date ?? '').slice(0, 10);
        if (!date) throw error(400, 'Date required');
        const label = String(body.label ?? '').trim().slice(0, 200);
        const existing = await firstOrNull(
          'itinerary_items',
          pb.filter('trip = {:t} && date ~ {:d}', { t: trip.id, d: date })
        );
        if (!label) {
          if (existing) await pb.collection('itinerary_items').delete(existing.id);
        } else if (existing) {
          await pb.collection('itinerary_items').update(existing.id, { label });
        } else {
          await pb.collection('itinerary_items').create({ trip: trip.id, date: `${date} 00:00:00.000Z`, label });
        }
        break;
      }

      // Set my own dietary note (or, for an organizer, someone else's). Feeds the
      // Meals section so cooks can plan around allergies / preferences.
      case 'set_dietary': {
        const p = await targetParticipant();
        const dietary = String(body.dietary ?? '').trim().slice(0, 200);
        await pb.collection('participants').update(p.id, { dietary });
        break;
      }

      // Toggle my own trip-notification preference.
      case 'notify_toggle': {
        await pb.collection('participants').update(me.id, { notify: me.notify === false });
        break;
      }

      // Leave the trip: unlink my account from this participant. The claimed name
      // and my contributions stay as an unclaimed orphan (re-joining reclaims it).
      case 'leave_trip': {
        await pb.collection('participants').update(me.id, { user: '' });
        break;
      }

      // Edit the trip's core details (organizer only).
      case 'trip_update': {
        if (!isOrganizer) throw error(403, 'Only organizers can edit the trip');
        const t = (/** @type {string} */ s) => String(s ?? '').trim();
        const name = t(body.name).slice(0, 200);
        const start = t(body.start_date).slice(0, 10);
        const end = t(body.end_date).slice(0, 10);
        const expense_link = t(body.expense_link);
        if (!name) throw error(400, 'Give your trip a name');
        if (start && end && end < start) throw error(400, 'End date is before the start date');
        if (expense_link && !/^https?:\/\/.+/i.test(expense_link)) throw error(400, 'Enter a full http(s):// URL');
        const descText = t(body.description).slice(0, 5000);
        const descHtml = descText
          ? `<p>${descText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`
          : '';
        const minNights = Math.max(0, Math.min(365, Math.round(Number(body.min_nights) || 0)));
        await pb.collection('trips').update(trip.id, {
          name,
          trip_type: t(body.trip_type).slice(0, 30),
          location: t(body.location).slice(0, 300),
          start_date: start ? `${start} 00:00:00.000Z` : '',
          end_date: end ? `${end} 00:00:00.000Z` : '',
          description: descHtml,
          expense_link,
          min_nights: minNights,
          emergency_info: t(body.emergency_info).slice(0, 2000)
        });
        break;
      }

      // Set my own arrival status (or, for an organizer, someone else's). Drives
      // the live check-in row in Who's coming. '' clears it.
      case 'set_arrival': {
        const p = await targetParticipant();
        const v = String(body.arrival ?? '');
        const arrival = ['not_left', 'en_route', 'arrived'].includes(v) ? v : '';
        await pb.collection('participants').update(p.id, { arrival });
        break;
      }

      // Promote/demote a member (organizer only; never drop to zero organizers).
      case 'set_role': {
        if (!isOrganizer) throw error(403, 'Only organizers can change roles');
        const role = String(body.role ?? '');
        if (!['organizer', 'guest'].includes(role)) throw error(400, 'Bad role');
        const target = await inTrip('participants', body.participantId);
        if (role === 'guest' && target.role === 'organizer') {
          const orgs = await pb.collection('participants').getFullList({
            filter: pb.filter('trip = {:t} && role = "organizer"', { t: trip.id })
          });
          if (orgs.length <= 1) throw error(400, 'A trip needs at least one organizer');
        }
        await pb.collection('participants').update(target.id, { role });
        break;
      }

      // Remove a member + their contributions (organizer only).
      case 'remove_member': {
        if (!isOrganizer) throw error(403, 'Only organizers can remove members');
        const target = await inTrip('participants', body.participantId);
        if (target.role === 'organizer') {
          const orgs = await pb.collection('participants').getFullList({
            filter: pb.filter('trip = {:t} && role = "organizer"', { t: trip.id })
          });
          if (orgs.length <= 1) throw error(400, 'Demote them first — a trip needs an organizer');
        }
        for (const coll of ['gear_claims', 'meal_signups', 'packing_items']) {
          const rows = await pb
            .collection(coll)
            .getFullList({ filter: pb.filter('participant = {:p}', { p: target.id }) })
            .catch(() => []);
          for (const r of rows) await pb.collection(coll).delete(r.id).catch(() => {});
        }
        await pb.collection('participants').delete(target.id).catch(() => {});
        break;
      }

      // Hide / restore a section for the whole trip (organizer only).
      case 'section_hide':
      case 'section_show': {
        if (!isOrganizer) throw error(403, 'Only organizers can change sections');
        const key = String(body.key ?? '').slice(0, 40);
        if (!key) throw error(400, 'Section required');
        const cur = Array.isArray(trip.hidden_sections) ? trip.hidden_sections : [];
        const next = op === 'section_hide' ? [...new Set([...cur, key])] : cur.filter((/** @type {string} */ k) => k !== key);
        await pb.collection('trips').update(trip.id, { hidden_sections: next });
        break;
      }

      // ---- Invite control (organizer only) ----

      // How people join via the link: instant or request-to-join.
      case 'set_join_policy': {
        if (!isOrganizer) throw error(403, 'Only organizers can change this');
        const value = body.value === 'approval' ? 'approval' : 'instant';
        await pb.collection('trips').update(trip.id, { join_policy: value });
        break;
      }

      // Who can see/share the invite link: everyone on the trip, or organizers only.
      case 'set_invite_visibility': {
        if (!isOrganizer) throw error(403, 'Only organizers can change this');
        const value = body.value === 'organizers' ? 'organizers' : 'everyone';
        await pb.collection('trips').update(trip.id, { invite_visibility: value });
        break;
      }

      // Approve a pending request → active member.
      case 'approve_member': {
        if (!isOrganizer) throw error(403, 'Only organizers can approve');
        const target = await inTrip('participants', body.participantId);
        if (target.status === 'pending') await pb.collection('participants').update(target.id, { status: 'active' });
        break;
      }

      // Deny a pending request → remove it.
      case 'deny_member': {
        if (!isOrganizer) throw error(403, 'Only organizers can deny');
        const target = await inTrip('participants', body.participantId);
        if (target.status === 'pending') await pb.collection('participants').delete(target.id);
        break;
      }

      // Email someone the invite link. Gated like sharing the link (invite_visibility):
      // everyone may invite unless it's organizers-only. Body is fixed (no injected
      // content) so the endpoint can't be used as a spam relay.
      case 'invite_email': {
        if (!isOrganizer && (trip.invite_visibility || 'everyone') === 'organizers') {
          throw error(403, 'Only organizers can invite to this trip');
        }
        if (!isMailConfigured()) throw error(400, 'Email invites are not set up');
        const to = String(body.email ?? '').trim().slice(0, 254);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw error(400, 'Enter a valid email address');
        const inviteUrl = `${url.origin}/${trip.share_token}`;
        try {
          await sendInviteEmail({
            to,
            tripName: trip.name,
            inviterName: me.display_name || 'Someone',
            inviteUrl
          });
        } catch (/** @type {any} */ e) {
          throw error(502, 'Could not send the email — check the address and try again');
        }
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
