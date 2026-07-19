import { json, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { getMembership } from '$lib/server/membership.js';
import { isMailConfigured, sendInviteEmail } from '$lib/server/mailer.js';
import { immichConfigured, createTripAlbum, syncAlbumName, parseShareLink } from '$lib/server/immich.js';
import { inviteFriendToTrip } from '$lib/server/invitations.js';
import { isVisibility } from '$lib/visibility.js';

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

  // Validate + normalize a map-pin payload (shared by add/update).
  const PIN_CATEGORIES = ['campsite', 'lodging', 'meetup', 'parking', 'trailhead', 'gas', 'food', 'water', 'viewpoint', 'other'];
  /** @param {any} b */
  function pinFields(b) {
    const label = String(b.label ?? '').trim().slice(0, 200);
    if (!label) throw error(400, 'A pin needs a label');
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw error(400, 'Bad latitude');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw error(400, 'Bad longitude');
    const category = PIN_CATEGORIES.includes(String(b.category)) ? String(b.category) : 'other';
    const note = String(b.note ?? '').trim().slice(0, 500);
    return { label, lat, lng, category, note };
  }

  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

      // ---- Itinerary (#18 + #17) — day-by-day plan. Items are either `fixed`
      // (a confirmed schedule entry — check-in/out, not votable) or `flexible`
      // (an optional suggestion the crew upvotes directly). Any member adds items
      // and upvotes flexible ones; the item's creator or an organizer edits/removes.

      // Add a plan item. `date` optional (omit → an undated decision). `kind`
      // defaults to flexible (a suggestion); pass 'fixed' for a set schedule entry.
      case 'itin_item_add': {
        const label = String(body.label ?? '').trim().slice(0, 200);
        if (!label) throw error(400, 'Name the entry');
        const date = String(body.date ?? '').slice(0, 10);
        if (date && !DATE_ONLY.test(date)) throw error(400, 'Bad date');
        const time = String(body.time ?? '').trim().slice(0, 40);
        const place = String(body.place ?? '').trim().slice(0, 300);
        const note = String(body.note ?? '').trim().slice(0, 600);
        const kind = body.kind === 'fixed' ? 'fixed' : 'flexible';
        const sameDay = pb.filter('trip = {:t} && date = {:d}', {
          t: trip.id,
          d: date ? `${date} 00:00:00.000Z` : ''
        });
        const count = (await pb.collection('itinerary_items').getList(1, 1, { filter: sameDay })).totalItems;
        await pb.collection('itinerary_items').create({
          trip: trip.id,
          date: date ? `${date} 00:00:00.000Z` : '',
          time,
          place,
          note,
          label,
          kind,
          sort_order: count,
          created_by: me.id
        });
        break;
      }

      // Edit an item's label / time / date / kind (creator or organizer).
      case 'itin_item_update': {
        const item = await inTrip('itinerary_items', String(body.itemId ?? ''));
        if (item.created_by !== me.id && !isOrganizer) throw error(403, 'Only the person who added this (or an organizer) can edit it');
        /** @type {Record<string, unknown>} */
        const data = {};
        if (body.label !== undefined) {
          const label = String(body.label ?? '').trim().slice(0, 200);
          if (!label) throw error(400, 'Name the entry');
          data.label = label;
        }
        if (body.time !== undefined) data.time = String(body.time ?? '').trim().slice(0, 40);
        if (body.place !== undefined) data.place = String(body.place ?? '').trim().slice(0, 300);
        if (body.note !== undefined) data.note = String(body.note ?? '').trim().slice(0, 600);
        if (body.kind !== undefined) data.kind = body.kind === 'fixed' ? 'fixed' : 'flexible';
        if (body.date !== undefined) {
          const date = String(body.date ?? '').slice(0, 10);
          if (date && !DATE_ONLY.test(date)) throw error(400, 'Bad date');
          data.date = date ? `${date} 00:00:00.000Z` : '';
        }
        await pb.collection('itinerary_items').update(item.id, data);
        break;
      }

      // Remove an item (creator or organizer). Cascade drops its votes.
      case 'itin_item_remove': {
        const item = await inTrip('itinerary_items', String(body.itemId ?? ''));
        if (item.created_by !== me.id && !isOrganizer) throw error(403, 'Only the person who added this (or an organizer) can remove it');
        await pb.collection('itinerary_items').delete(item.id);
        break;
      }

      // Toggle my upvote on a flexible item (any member). Fixed entries aren't votable.
      case 'itin_vote': {
        const item = await inTrip('itinerary_items', String(body.itemId ?? ''));
        if ((item.kind || 'flexible') === 'fixed') throw error(400, "That's a fixed entry — nothing to vote on");
        const mine = await firstOrNull(
          'itinerary_votes',
          pb.filter('itinerary_item = {:i} && participant = {:p}', { i: item.id, p: me.id })
        );
        if (mine) await pb.collection('itinerary_votes').delete(mine.id);
        else await pb.collection('itinerary_votes').create({ itinerary_item: item.id, participant: me.id });
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

      // ---- Cities (dated trip segments, organizer only) ----

      // Add a city segment. `name` is required; `start_date`/`end_date` are
      // optional YYYY-MM-DD (the itinerary groups days under the city whose
      // range contains them).
      case 'city_add': {
        if (!isOrganizer) throw error(403, 'Only organizers can edit cities');
        const name = String(body.name ?? '').trim().slice(0, 120);
        if (!name) throw error(400, 'Name the city');
        const start = String(body.start_date ?? '').slice(0, 10);
        const end = String(body.end_date ?? '').slice(0, 10);
        const bad = (/** @type {string} */ d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d);
        if (bad(start) || bad(end)) throw error(400, 'Bad date');
        if (start && end && end < start) throw error(400, 'End date is before the start date');
        const count = (
          await pb.collection('trip_cities').getList(1, 1, { filter: pb.filter('trip = {:t}', { t: trip.id }) })
        ).totalItems;
        await pb.collection('trip_cities').create({
          trip: trip.id,
          name,
          start_date: start ? `${start} 00:00:00.000Z` : '',
          end_date: end ? `${end} 00:00:00.000Z` : '',
          sort_order: count
        });
        break;
      }

      // Edit a city's name / dates (organizer only).
      case 'city_update': {
        if (!isOrganizer) throw error(403, 'Only organizers can edit cities');
        const city = await inTrip('trip_cities', String(body.cityId ?? ''));
        const name = String(body.name ?? '').trim().slice(0, 120);
        if (!name) throw error(400, 'Name the city');
        const start = String(body.start_date ?? '').slice(0, 10);
        const end = String(body.end_date ?? '').slice(0, 10);
        const bad = (/** @type {string} */ d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d);
        if (bad(start) || bad(end)) throw error(400, 'Bad date');
        if (start && end && end < start) throw error(400, 'End date is before the start date');
        await pb.collection('trip_cities').update(city.id, {
          name,
          start_date: start ? `${start} 00:00:00.000Z` : '',
          end_date: end ? `${end} 00:00:00.000Z` : ''
        });
        break;
      }

      // Remove a city segment (organizer only). Itinerary items are unaffected —
      // their city was only ever derived from dates.
      case 'city_remove': {
        if (!isOrganizer) throw error(403, 'Only organizers can edit cities');
        const city = await inTrip('trip_cities', String(body.cityId ?? ''));
        await pb.collection('trip_cities').delete(city.id);
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
        // Keep a linked Immich album's name in sync with "Type - Trip Name"
        // (best-effort — a rename failure must not block saving the trip).
        if (trip.immich_album_id) {
          try {
            await syncAlbumName({ immich_album_id: trip.immich_album_id, name, trip_type: t(body.trip_type).slice(0, 30) });
          } catch (_) {
            // ignore; the trip is saved regardless
          }
        }
        break;
      }

      // ---- Immich album (organizer only; opt-in, never automatic) ----

      // Create a shared Immich album for this trip and link it.
      case 'album_create': {
        if (!isOrganizer) throw error(403, 'Only organizers can manage the album');
        if (trip.immich_album_id || trip.immich_album_url) throw error(400, 'This trip already has an album');
        if (!(await immichConfigured())) throw error(400, 'Immich is not set up for this instance');
        let result;
        try {
          result = await createTripAlbum(trip);
        } catch (/** @type {any} */ e) {
          throw error(502, e?.message || 'Could not create the Immich album');
        }
        await pb.collection('trips').update(trip.id, { immich_album_id: result.albumId, immich_album_url: result.albumUrl });
        return json({ ok: true, albumUrl: result.albumUrl });
      }

      // Link an existing Immich shared album by pasting its share link. We can
      // embed it but not rename it (we don't own its album id), so the
      // "Type - Name" sync doesn't apply to manually-linked albums.
      case 'album_link': {
        if (!isOrganizer) throw error(403, 'Only organizers can manage the album');
        const parsed = parseShareLink(body.url);
        if (!parsed?.url) throw error(400, 'Paste a full Immich share link (…/share/<key>)');
        await pb.collection('trips').update(trip.id, { immich_album_url: parsed.url, immich_album_id: '' });
        return json({ ok: true, albumUrl: parsed.url });
      }

      // Unlink the album from the trip (does NOT delete it in Immich).
      case 'album_unlink': {
        if (!isOrganizer) throw error(403, 'Only organizers can manage the album');
        await pb.collection('trips').update(trip.id, { immich_album_id: '', immich_album_url: '' });
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

      // Invite a co-organizer by email (#16): record an organizer invite so the
      // account joins straight as an organizer (no owner-token link to share),
      // and email them the invite link if SMTP is set up. The grant is what
      // matters, so a failed/absent email doesn't fail the op.
      case 'invite_organizer': {
        if (!isOrganizer) throw error(403, 'Only organizers can invite co-organizers');
        const email = String(body.email ?? '').trim().toLowerCase().slice(0, 254);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw error(400, 'Enter a valid email address');

        // Upsert one invite per (trip, email).
        const existing = await pb
          .collection('invites')
          .getList(1, 1, { filter: pb.filter('trip = {:t} && email = {:e}', { t: trip.id, e: email }) });
        if (existing.items[0]) {
          await pb.collection('invites').update(existing.items[0].id, { role: 'organizer', invited_by: locals.user.id });
        } else {
          await pb.collection('invites').create({ trip: trip.id, email, role: 'organizer', invited_by: locals.user.id });
        }

        let emailed = false;
        if (isMailConfigured()) {
          try {
            await sendInviteEmail({
              to: email,
              tripName: trip.name,
              inviterName: me.display_name || 'Someone',
              inviteUrl: `${url.origin}/${trip.share_token}`
            });
            emailed = true;
          } catch (_) {
            /* invite still stands; organizer can share the link manually */
          }
        }
        return json({ ok: true, emailed });
      }

      // ---- Map pins (#12) — any member can add/edit; creator or organizer deletes.
      case 'pin_add': {
        const fields = pinFields(body);
        await pb.collection('map_pins').create({ trip: trip.id, created_by: me.id, ...fields });
        break;
      }
      case 'pin_update': {
        const pin = await inTrip('map_pins', String(body.pinId ?? ''));
        await pb.collection('map_pins').update(pin.id, pinFields(body));
        break;
      }
      case 'pin_delete': {
        const pin = await inTrip('map_pins', String(body.pinId ?? ''));
        if (!isOrganizer && pin.created_by !== me.id) throw error(403, 'Only the person who added a pin (or an organizer) can remove it');
        await pb.collection('map_pins').delete(pin.id);
        break;
      }

      // ---- Friend-based invites & calendar visibility (#30) ----

      // Invite a friend (a known account) to this trip → lands on their dashboard
      // as an Accept/Decline card. Any member may invite, but a guest can only
      // invite people they're already friends with (enforced in the helper);
      // organizers may invite anyone and may grant an organizer role.
      case 'invite_friend': {
        if (!isOrganizer && (trip.invite_visibility || 'everyone') === 'organizers') {
          throw error(403, 'Only organizers can invite to this trip');
        }
        const friendUserId = String(body.userId ?? '').trim();
        if (!friendUserId) throw error(400, 'Pick a friend to invite');
        const role = body.role === 'organizer' ? 'organizer' : 'guest';
        const res = await inviteFriendToTrip(pb, trip, me, friendUserId, role);
        if (!res.ok && res.reason === 'not_friends') {
          throw error(403, 'You can only invite people you’re friends with');
        }
        return json({ ok: res.ok, reason: res.reason ?? null });
      }

      // Revoke a pending trip invitation (organizer only).
      case 'revoke_trip_invitation': {
        if (!isOrganizer) throw error(403, 'Only organizers can revoke invitations');
        const inv = await pb
          .collection('trip_invitations')
          .getOne(String(body.invitationId ?? ''))
          .catch(() => null);
        if (inv && inv.trip === trip.id) await pb.collection('trip_invitations').delete(inv.id);
        break;
      }

      // Calendar visibility: private (members-only), busy (friends see the dates
      // only) or friends (friends see the full teaser). Organizer only. An
      // unrecognised value falls back to 'private' rather than over-sharing.
      case 'set_visibility': {
        if (!isOrganizer) throw error(403, 'Only organizers can change this');
        const value = isVisibility(body.value) ? body.value : 'private';
        await pb.collection('trips').update(trip.id, { visibility: value });
        break;
      }

      // Move a trip back to the "Someday" Ideas wishlist (status='idea') from any
      // later stage. Non-destructive — everything is kept; it just drops off the
      // dated dashboard and reopens the planning canvas. Organizer only, mirrors
      // the idea→planning "promote". (Reversible via promote.)
      case 'demote_to_idea': {
        if (!isOrganizer) throw error(403, 'Only organizers can change the trip stage');
        if (trip.status !== 'idea') await pb.collection('trips').update(trip.id, { status: 'idea' });
        break;
      }

      // Revoke a pending co-organizer invite.
      case 'revoke_invite': {
        if (!isOrganizer) throw error(403, 'Only organizers can revoke invites');
        const inv = await pb.collection('invites').getOne(String(body.inviteId ?? '')).catch(() => null);
        if (inv && inv.trip === trip.id) await pb.collection('invites').delete(inv.id);
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
