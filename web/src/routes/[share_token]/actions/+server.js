import { json, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { loadTripByShareToken, requireActiveMembership, assertInTrip } from '$lib/server/tripAuthz.js';
import { TRIP_STATUSES } from '$lib/server/createTrip.js';
import { isMailConfigured, sendInviteEmail } from '$lib/server/mailer.js';
import { immichConfigured, createTripAlbum, syncAlbumName } from '$lib/server/immich.js';
import { parseAlbumLink } from '$lib/photoProviders.js';
import { inviteFriendToTrip } from '$lib/server/invitations.js';
import { isVisibility } from '$lib/visibility.js';
import { claimQty, canTogglePacking, canRecommend } from '$lib/bring.js';
import { unfurl } from '$lib/server/unfurl.js';
import { hasCoords, clampNum } from '$lib/coords.js';
import { sanitizeCoordinates, trackStats, fromCoordinates } from '$lib/gpx.js';
import { linkDisplayName } from '$lib/linkName.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB, matches the itinerary image field cap

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
  // Captured once so nested helpers keep the non-null narrowing.
  const actorId = locals.user.id;

  const pb = await superuserPb();

  // Trip resolution + membership/role checks are shared with the personal-key API
  // (see $lib/server/tripAuthz.js) so a headless key can never exceed the UI.
  const trip = /** @type {any} */ (await loadTripByShareToken(pb, params.share_token));
  const { me, isOrganizer } = await requireActiveMembership(pb, trip, locals.user.id);

  // Most ops send JSON; image uploads (itinerary media) send multipart/form-data
  // (a File can't ride in JSON). Parse whichever shape arrived into a plain
  // `body` + optional file — mirrors the /plan endpoint's location uploads.
  const contentType = request.headers.get('content-type') || '';
  /** @type {Record<string, any>} */
  let body = {};
  /** @type {File | null} */
  let imageFile = null;
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (form) {
      for (const [k, v] of form.entries()) if (typeof v === 'string') body[k] = v;
      const f = form.get('image');
      if (f instanceof File && f.size > 0) imageFile = f;
    }
  } else {
    body = await request.json().catch(() => ({}));
  }
  const op = String(body.op ?? '');

  /** Fetch a row and assert it belongs to this trip (via its `trip` field). */
  const inTrip = (/** @type {string} */ coll, /** @type {string} */ id) =>
    assertInTrip(pb, trip, coll, id);

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

  // ---- Email invites ----

  // The link an emailed invite must carry: the share slug PLUS the trip's invite
  // capability token (#2). Without the token the recipient lands on the view-only
  // teaser with no way to join.
  const joinUrl = () =>
    trip.invite_token
      ? `${url.origin}/${trip.share_token}?invite=${encodeURIComponent(trip.invite_token)}`
      : `${url.origin}/${trip.share_token}`;

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  /** Normalize + validate an invite address. Stored lowercased. @param {unknown} raw */
  function inviteEmail(raw) {
    const e = String(raw ?? '').trim().toLowerCase().slice(0, 254);
    if (!EMAIL_RE.test(e)) throw error(400, 'Enter a valid email address');
    return e;
  }

  // How long an invite has to sit before it can be emailed again. Resending is
  // rare and legitimate (it went to spam), so a wait costs nobody anything —
  // whereas without one, `resend_invite` is a free way to hammer an arbitrary
  // address through our SMTP relay.
  const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

  /**
   * Record an email invite so it's visible as "invited" on the people surface and
   * can be resent or revoked. One row per (trip, email); an existing co-organizer
   * invite is never demoted to guest by a later plain invite.
   *
   * `invited_by` only moves to the current actor when they're an organizer.
   * Otherwise a plain member re-inviting an address an organizer had already
   * vouched for would overwrite that provenance — and since an organizer's
   * vouching is what lets a guest invite skip the approval queue, that would
   * silently strip the bypass and strand someone the organizer let in.
   *
   * @param {string} email @param {string} role
   * @param {{ sent?: boolean }} [opts] whether an invite email just went out
   */
  async function upsertInvite(email, role, opts = {}) {
    const existing = await firstOrNull(
      'invites',
      pb.filter('trip = {:t} && email = {:e}', { t: trip.id, e: email })
    );
    /** @type {Record<string, unknown>} */
    const patch = {
      role: role === 'organizer' || existing?.role === 'organizer' ? 'organizer' : 'guest'
    };
    if (opts.sent) patch.last_sent = new Date().toISOString();
    if (!existing || isOrganizer) patch.invited_by = actorId;

    if (existing) {
      await pb.collection('invites').update(existing.id, patch);
      return existing.id;
    }
    const created = await pb.collection('invites').create({ trip: trip.id, email, ...patch });
    return created.id;
  }

  /**
   * One (`label`) or many (`labels`) item names, e.g. a pasted list. Trimmed,
   * capped at 200 chars each and 50 per call. Shared by pack_add / recommend_add.
   * @param {any} b
   */
  function labelList(b) {
    const raw = Array.isArray(b.labels) ? b.labels : [b.label];
    const labels = raw
      .map((/** @type {any} */ l) => String(l ?? '').trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 50);
    if (!labels.length) throw error(400, 'Label required');
    return labels;
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

  // Validate + normalize a booking payload (shared by add/update — #4).
  const BOOKING_TYPES = ['flight', 'stay', 'car', 'other'];
  const BOOKING_STATUSES = ['planning', 'booked', 'confirmed'];
  const REFUND_STATES = ['unknown', 'refundable', 'nonrefundable'];
  /** @param {any} b */
  function bookingFields(b) {
    const title = String(b.title ?? '').trim().slice(0, 200);
    if (!title) throw error(400, 'Give the booking a title');
    /** @param {any} d */
    const asDate = (d) => {
      const s = String(d ?? '').slice(0, 10);
      if (s && !DATE_ONLY.test(s)) throw error(400, 'Bad date');
      return s ? `${s} 00:00:00.000Z` : '';
    };
    const start = String(b.start_date ?? '').slice(0, 10);
    const end = String(b.end_date ?? '').slice(0, 10);
    if (start && end && DATE_ONLY.test(start) && DATE_ONLY.test(end) && end < start) {
      throw error(400, 'End date is before the start date');
    }
    const link = String(b.link ?? '').trim();
    if (link && !/^https?:\/\/.+/i.test(link)) throw error(400, 'Enter a full http(s):// URL');
    const rawCost = b.cost;
    const cost = rawCost === '' || rawCost === null || rawCost === undefined ? '' : Math.max(0, Number(rawCost) || 0);
    return {
      type: BOOKING_TYPES.includes(b.type) ? b.type : 'other',
      title,
      status: BOOKING_STATUSES.includes(b.status) ? b.status : 'planning',
      refundable: REFUND_STATES.includes(b.refundable) ? b.refundable : 'unknown',
      refund_deadline: asDate(b.refund_deadline),
      start_date: asDate(b.start_date),
      end_date: asDate(b.end_date),
      cost,
      currency: String(b.currency ?? '').trim().slice(0, 8),
      confirmation: String(b.confirmation ?? '').trim().slice(0, 120),
      link,
      notes: String(b.notes ?? '').trim().slice(0, 1000)
    };
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

      // Remove a gear item outright, with its claims and the auto-added bag rows
      // that pointed at it. Whoever added it, or an organizer — same rule as map
      // pins. (Until now neither gear nor bag items could be deleted at all; the
      // only way to lose one was to leave the trip.)
      case 'gear_delete': {
        const g = await inTrip('gear_items', String(body.gearItemId ?? ''));
        if (!isOrganizer && g.created_by !== me.id) {
          throw error(403, 'Only the person who added it (or an organizer) can remove it');
        }
        // PB cascades gear_claims and from_gear bag rows, but the cascade only
        // fires on the relation — do it explicitly so behaviour doesn't depend on
        // migration order.
        for (const coll of ['gear_claims', 'packing_items']) {
          const field = coll === 'gear_claims' ? 'gear_item' : 'from_gear';
          const rows = await pb
            .collection(coll)
            .getFullList({ filter: pb.filter(`${field} = {:g}`, { g: g.id }) })
            .catch(() => []);
          for (const r of rows) await pb.collection(coll).delete(r.id).catch(() => {});
        }
        await pb.collection('gear_items').delete(g.id);
        break;
      }

      // Remove an item from a bag. Yours, or an organizer tidying up.
      case 'pack_delete': {
        const item = await inTrip('packing_items', String(body.itemId ?? ''));
        if (!canTogglePacking(item, me.id, isOrganizer)) {
          throw error(403, "That's in someone else's bag");
        }
        await pb.collection('packing_items').delete(item.id);
        break;
      }

      case 'claim': {
        const g = await inTrip('gear_items', body.gearItemId);
        const claims = await pb
          .collection('gear_claims')
          .getFullList({ filter: pb.filter('gear_item = {:g}', { g: g.id }) });
        await pb
          .collection('gear_claims')
          .create({
            gear_item: g.id,
            participant: me.id,
            qty_claimed: claimQty(g.qty_needed, /** @type {any} */ (claims))
          });
        // Auto-add to the claimer's own pack (dedupe-guarded). `from_gear` links
        // the two — the same link `pack_share` creates coming the other way.
        const existing = await firstOrNull(
          'packing_items',
          pb.filter('from_gear = {:g} && participant = {:p}', { g: g.id, p: me.id })
        );
        if (!existing) {
          await pb.collection('packing_items').create({
            trip: trip.id,
            participant: me.id,
            label: g.name,
            recommended: false,
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
        // Your bag is yours — only you (or an organizer) may tick it.
        if (!canTogglePacking(item, me.id, isOrganizer)) {
          throw error(403, "That's in someone else's bag");
        }
        await pb.collection('packing_items').update(item.id, { checked: !item.checked });
        break;
      }

      // Add to your own pack. Always personal now — anything meant for the crew
      // goes on the public list instead (gear_add, or pack_share below).
      case 'pack_add': {
        for (const label of labelList(body)) {
          await pb.collection('packing_items').create({
            trip: trip.id,
            label,
            recommended: false,
            checked: false,
            participant: me.id
          });
        }
        break;
      }

      // Organizer suggestions. These aren't anybody's items yet — they're a
      // template that shows as a ghost row in every member's pack until adopted.
      case 'recommend_add': {
        if (!canRecommend(isOrganizer)) throw error(403, 'Only organizers can recommend items');
        for (const label of labelList(body)) {
          await pb.collection('packing_items').create({
            trip: trip.id,
            label,
            recommended: true,
            checked: false,
            participant: null
          });
        }
        break;
      }

      // Withdraw a suggestion. Copies people have already adopted are THEIRS and
      // stay put (from_recommendation is a non-cascading link, by design).
      case 'recommend_remove': {
        if (!canRecommend(isOrganizer)) throw error(403, 'Only organizers can recommend items');
        const rec = await inTrip('packing_items', String(body.itemId ?? ''));
        if (!rec.recommended) throw error(400, "That's not a recommendation");
        await pb.collection('packing_items').delete(rec.id);
        break;
      }

      // Take up a suggestion: it becomes a real item in your pack, and stops
      // being suggested to you (but stays on offer to everyone else).
      case 'pack_adopt': {
        const rec = await inTrip('packing_items', String(body.itemId ?? ''));
        if (!rec.recommended) throw error(400, "That's not a recommendation");
        const already = await firstOrNull(
          'packing_items',
          pb.filter('from_recommendation = {:r} && participant = {:p}', { r: rec.id, p: me.id })
        );
        if (!already) {
          await pb.collection('packing_items').create({
            trip: trip.id,
            label: rec.label,
            recommended: false,
            checked: false,
            participant: me.id,
            from_recommendation: rec.id
          });
        }
        break;
      }

      // The eye: put one of your items on the public list so the crew can see
      // you've got it covered. This is the claim bridge run backwards — it
      // creates a public item already claimed by you, and links your personal row
      // to it with `from_gear`, exactly as claiming public gear does in reverse.
      case 'pack_share': {
        const item = await inTrip('packing_items', String(body.itemId ?? ''));
        if (item.recommended) throw error(400, 'Adopt it first, then share it');
        if (item.participant !== me.id) throw error(403, "That's in someone else's pack");
        if (item.from_gear) break; // already public

        const g = await pb.collection('gear_items').create({
          trip: trip.id,
          name: item.label,
          qty_needed: 1,
          created_by: me.id
        });
        await pb
          .collection('gear_claims')
          .create({ gear_item: g.id, participant: me.id, qty_claimed: 1 });
        await pb.collection('packing_items').update(item.id, { from_gear: g.id });
        break;
      }

      // Eye off: take it back off the public list. Only tears down the public
      // item if you're its sole claimer — if someone else has since signed up to
      // bring one too, the group still needs it, so it stays.
      case 'pack_unshare': {
        const item = await inTrip('packing_items', String(body.itemId ?? ''));
        if (item.participant !== me.id) throw error(403, "That's in someone else's pack");
        if (!item.from_gear) break; // wasn't public

        const gearId = item.from_gear;
        await pb.collection('packing_items').update(item.id, { from_gear: null });

        const mine = await firstOrNull(
          'gear_claims',
          pb.filter('gear_item = {:g} && participant = {:p}', { g: gearId, p: me.id })
        );
        if (mine) await pb.collection('gear_claims').delete(mine.id).catch(() => {});

        const others = await pb
          .collection('gear_claims')
          .getFullList({ filter: pb.filter('gear_item = {:g}', { g: gearId }) })
          .catch(() => []);
        if (!others.length) {
          const g = await pb.collection('gear_items').getOne(gearId).catch(() => null);
          // Only remove it if it existed purely as your offer. If the group had
          // asked for it independently, the request outlives your withdrawal.
          if (g && g.created_by === me.id) {
            await pb.collection('gear_items').delete(gearId).catch(() => {});
          }
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
        const url = String(body.url ?? '').trim();
        if (url && !/^https?:\/\/.+/i.test(url)) throw error(400, 'Links need http(s)://');
        const kind = body.kind === 'fixed' ? 'fixed' : 'flexible';
        const sameDay = pb.filter('trip = {:t} && date = {:d}', {
          t: trip.id,
          d: date ? `${date} 00:00:00.000Z` : ''
        });
        const count = (await pb.collection('itinerary_items').getList(1, 1, { filter: sameDay })).totalItems;
        const item = await pb.collection('itinerary_items').create({
          trip: trip.id,
          date: date ? `${date} 00:00:00.000Z` : '',
          time,
          place,
          note,
          url: url.slice(0, 500),
          label,
          kind,
          sort_order: count,
          created_by: me.id
        });
        // Unfurl the link ONCE, here, so the card has a preview on first render.
        // Best-effort + SSRF-guarded inside unfurl(); mark fetched either way so a
        // site with no OG tags isn't retried on every load (mirrors add_location).
        if (url) {
          const preview = await unfurl(url);
          await pb.collection('itinerary_items').update(item.id, {
            preview_image: preview?.image ?? '',
            preview_title: preview?.title ?? '',
            preview_description: preview?.description ?? '',
            preview_fetched: true
          });
        }
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
        // Link edits re-unfurl, but only when the URL actually changed — an
        // unrelated label/time edit shouldn't refetch (or wipe) the preview.
        let refetchUrl = null;
        if (body.url !== undefined) {
          const url = String(body.url ?? '').trim();
          if (url && !/^https?:\/\/.+/i.test(url)) throw error(400, 'Links need http(s)://');
          data.url = url.slice(0, 500);
          if (url !== (item.url || '')) {
            // Clear the stale preview now; re-unfurl below if there's a new link.
            data.preview_image = '';
            data.preview_title = '';
            data.preview_description = '';
            data.preview_fetched = !url; // no link → nothing to fetch
            refetchUrl = url || null;
          }
        }
        await pb.collection('itinerary_items').update(item.id, data);
        if (refetchUrl) {
          const preview = await unfurl(refetchUrl);
          await pb.collection('itinerary_items').update(item.id, {
            preview_image: preview?.image ?? '',
            preview_title: preview?.title ?? '',
            preview_description: preview?.description ?? '',
            preview_fetched: true
          });
        }
        break;
      }

      // Remove an item (creator or organizer). Cascade drops its votes.
      case 'itin_item_remove': {
        const item = await inTrip('itinerary_items', String(body.itemId ?? ''));
        if (item.created_by !== me.id && !isOrganizer) throw error(403, 'Only the person who added this (or an organizer) can remove it');
        await pb.collection('itinerary_items').delete(item.id);
        break;
      }

      // Upload (or replace) an item's picture — multipart, image only. Allowed
      // for the item's creator or an organizer. Overrides the link preview.
      case 'itin_item_image': {
        const item = await inTrip('itinerary_items', String(body.itemId ?? ''));
        if (item.created_by !== me.id && !isOrganizer) throw error(403, 'Only the person who added this (or an organizer) can edit it');
        if (!imageFile) throw error(400, 'Choose an image first');
        if (!imageFile.type.startsWith('image/')) throw error(400, "That doesn't look like an image");
        if (imageFile.size > MAX_IMAGE_BYTES) throw error(400, 'Image must be under 5 MB');
        const fd = new FormData();
        fd.append('image', imageFile, imageFile.name || 'photo');
        try {
          await pb.collection('itinerary_items').update(item.id, fd);
        } catch (_) {
          throw error(400, 'Could not save that image — try a different one');
        }
        break;
      }

      case 'itin_item_image_remove': {
        const item = await inTrip('itinerary_items', String(body.itemId ?? ''));
        if (item.created_by !== me.id && !isOrganizer) throw error(403, 'Only the person who added this (or an organizer) can edit it');
        await pb.collection('itinerary_items').update(item.id, { image: null });
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

      // ---- Bookings (flights/stays/etc — #4) ----
      // Any member may add a booking (often a personal flight/room); the person
      // who added it, or an organizer, may edit/remove it.

      case 'booking_add': {
        const fields = bookingFields(body);
        await pb.collection('bookings').create({ trip: trip.id, added_by: me.id, ...fields });
        break;
      }

      case 'booking_update': {
        const b = await inTrip('bookings', String(body.bookingId ?? ''));
        if (b.added_by !== me.id && !isOrganizer) {
          throw error(403, 'Only the person who added this (or an organizer) can edit it');
        }
        await pb.collection('bookings').update(b.id, bookingFields(body));
        break;
      }

      case 'booking_remove': {
        const b = await inTrip('bookings', String(body.bookingId ?? ''));
        if (b.added_by !== me.id && !isOrganizer) {
          throw error(403, 'Only the person who added this (or an organizer) can remove it');
        }
        await pb.collection('bookings').delete(b.id);
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
        // Canonical coordinates from the location picker (#weather-accuracy).
        // Both blank/invalid → store 0,0 = "unset" (weather falls back to the
        // legacy name-geocode). place_name only kept when the pin is real.
        const lat = clampNum(body.lat, -90, 90);
        const lng = clampNum(body.lng, -180, 180);
        const pinned = hasCoords(lat, lng);
        // Clear the cached elevation whenever the pin moves or is dropped, so the
        // backpacking surface refills it lazily for the new point (0 = "unknown").
        const pinMoved = !pinned || trip.lat !== lat || trip.lng !== lng;
        await pb.collection('trips').update(trip.id, {
          name,
          trip_type: t(body.trip_type).slice(0, 30),
          location: t(body.location).slice(0, 300),
          lat: pinned ? lat : 0,
          lng: pinned ? lng : 0,
          place_name: pinned ? t(body.place_name).slice(0, 300) : '',
          ...(pinMoved ? { elevation: 0 } : {}),
          start_date: start ? `${start} 00:00:00.000Z` : '',
          end_date: end ? `${end} 00:00:00.000Z` : '',
          description: descHtml,
          expense_link,
          min_nights: minNights,
          emergency_info: t(body.emergency_info).slice(0, 2000)
        });
        // Keep a linked Immich album's name in sync with "Type - Trip Name"
        // (best-effort — a rename failure must not block saving the trip).
        if (trip.photo_album_id) {
          try {
            await syncAlbumName({ photo_album_id: trip.photo_album_id, name, trip_type: t(body.trip_type).slice(0, 30) });
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
        if (trip.photo_album_id || trip.photo_album_url) throw error(400, 'This trip already has an album');
        if (!(await immichConfigured())) throw error(400, 'Immich is not set up for this instance');
        let result;
        try {
          result = await createTripAlbum(trip);
        } catch (/** @type {any} */ e) {
          throw error(502, e?.message || 'Could not create the Immich album');
        }
        await pb.collection('trips').update(trip.id, { photo_album_id: result.albumId, photo_album_url: result.albumUrl });
        return json({ ok: true, albumUrl: result.albumUrl });
      }

      // Link an existing shared album by pasting its share link — Google Photos,
      // iCloud, another Immich instance, etc. We store the URL to embed or link
      // out to, but can't rename it (we don't own its album id), so the
      // "Type - Name" sync doesn't apply to manually-linked albums.
      case 'album_link': {
        if (!isOrganizer) throw error(403, 'Only organizers can manage the album');
        const parsed = parseAlbumLink(body.url);
        if (!parsed) throw error(400, 'Paste a full album share link (https://…)');
        await pb.collection('trips').update(trip.id, { photo_album_url: parsed.url, photo_album_id: '' });
        return json({ ok: true, albumUrl: parsed.url });
      }

      // Unlink the album from the trip (does NOT delete it in Immich).
      case 'album_unlink': {
        if (!isOrganizer) throw error(403, 'Only organizers can manage the album');
        await pb.collection('trips').update(trip.id, { photo_album_id: '', photo_album_url: '' });
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
      //
      // The invite is RECORDED as well as sent — otherwise an emailed invite left
      // no trace anywhere and the crew had no way to see who was still outstanding.
      case 'invite_email': {
        if (!isOrganizer && (trip.invite_visibility || 'everyone') === 'organizers') {
          throw error(403, 'Only organizers can invite to this trip');
        }
        if (!isMailConfigured()) throw error(400, 'Email invites are not set up');
        const to = inviteEmail(body.email);
        try {
          await sendInviteEmail({
            to,
            tripName: trip.name,
            inviterName: me.display_name || 'Someone',
            inviteUrl: joinUrl()
          });
        } catch (/** @type {any} */ e) {
          throw error(502, 'Could not send the email — check the address and try again');
        }
        // Only recorded once the send succeeded, so a listed invite always means
        // "we actually emailed them".
        await upsertInvite(to, 'guest', { sent: true });
        break;
      }

      // Send an outstanding invite again (the recipient lost it / it went to spam).
      // Gated the same way as issuing one; refreshes `invited_by` to whoever resent.
      case 'resend_invite': {
        if (!isOrganizer && (trip.invite_visibility || 'everyone') === 'organizers') {
          throw error(403, 'Only organizers can invite to this trip');
        }
        if (!isMailConfigured()) throw error(400, 'Email invites are not set up');
        const inv = await pb
          .collection('invites')
          .getOne(String(body.inviteId ?? ''))
          .catch(() => null);
        if (!inv || inv.trip !== trip.id) throw error(404, 'That invite is no longer outstanding');

        const last = inv.last_sent ? new Date(inv.last_sent).getTime() : 0;
        const since = Date.now() - last;
        if (last && Number.isFinite(last) && since < RESEND_COOLDOWN_MS) {
          const mins = Math.ceil((RESEND_COOLDOWN_MS - since) / 60000);
          throw error(429, `That invite just went out — try again in ${mins} min.`);
        }

        try {
          await sendInviteEmail({
            to: inv.email,
            tripName: trip.name,
            inviterName: me.display_name || 'Someone',
            inviteUrl: joinUrl()
          });
        } catch (/** @type {any} */ e) {
          throw error(502, 'Could not send the email — try again in a moment');
        }
        // Same provenance rule as upsertInvite: a non-organizer resending must
        // not overwrite an organizer's vouching.
        await pb
          .collection('invites')
          .update(inv.id, {
            last_sent: new Date().toISOString(),
            ...(isOrganizer ? { invited_by: actorId } : {})
          });
        break;
      }

      // Invite a co-organizer by email (#16): record an organizer invite so the
      // account joins straight as an organizer (no owner-token link to share),
      // and email them the invite link if SMTP is set up. The grant is what
      // matters, so a failed/absent email doesn't fail the op.
      case 'invite_organizer': {
        if (!isOrganizer) throw error(403, 'Only organizers can invite co-organizers');
        const email = inviteEmail(body.email);
        // The grant is what matters here, so the row goes in first and a failed
        // (or unconfigured) email doesn't fail the op.
        const inviteId = await upsertInvite(email, 'organizer');

        let emailed = false;
        if (isMailConfigured()) {
          try {
            await sendInviteEmail({
              to: email,
              tripName: trip.name,
              inviterName: me.display_name || 'Someone',
              inviteUrl: joinUrl()
            });
            emailed = true;
            await pb.collection('invites').update(inviteId, { last_sent: new Date().toISOString() });
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

      // ---- Trip route (#backpacking Phase 3) — any member can import/link/clear.
      // Stats are always re-derived server-side from the sanitized geometry, so a
      // client can't inject bogus distance/gain numbers.
      case 'route_set': {
        const coords = sanitizeCoordinates(body.coordinates);
        if (!coords) throw error(400, 'That track had no usable points — try a different GPX file.');
        const stats = trackStats(fromCoordinates(coords));
        const prev = trip.route && typeof trip.route === 'object' ? trip.route : {};
        const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
        const url = /^https?:\/\/.+/i.test(rawUrl) ? rawUrl.slice(0, 500) : prev.url || '';
        const name = String(body.name ?? '').trim().slice(0, 120) || prev.name || '';
        await pb.collection('trips').update(trip.id, {
          route: { name, url, preview: prev.preview || null, coordinates: coords, stats }
        });
        break;
      }
      // Link a trail page (AllTrails/Gaia/CalTopo/…) — best-effort unfurl for a
      // preview; keeps any existing imported track.
      case 'route_link': {
        const url = String(body.url ?? '').trim().slice(0, 500);
        if (!/^https?:\/\/.+/i.test(url)) throw error(400, 'Enter a full http(s):// trail link');
        const prev = trip.route && typeof trip.route === 'object' ? trip.route : {};
        let preview = null;
        let ogTitle = '';
        try {
          const u = await unfurl(url); // SSRF-guarded inside
          if (u) {
            preview = { title: u.title || '', image: u.image || '', description: u.description || '' };
            ogTitle = u.title || '';
          }
        } catch (_) {
          /* link stands without a preview */
        }
        // Prefer an imported track's name; else the OG title; else a name derived
        // from the URL slug (so a Cloudflare-blocked AllTrails link still reads
        // "Big Pine Lakes Trail", not a bare URL).
        const name = prev.name || linkDisplayName(url, ogTitle);
        await pb.collection('trips').update(trip.id, {
          route: { name, url, preview, coordinates: prev.coordinates || [], stats: prev.stats || null }
        });
        break;
      }
      case 'route_clear': {
        await pb.collection('trips').update(trip.id, { route: null });
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

      // Single owner-facing status control (Trip settings → Stage). Moves the
      // trip to any lifecycle stage in either direction: idea → planning →
      // confirmed → completed and back. Supersedes the one-way demote_to_idea.
      // Organizer only; an unknown value is rejected rather than silently set.
      case 'set_status': {
        if (!isOrganizer) throw error(403, 'Only organizers can change the trip stage');
        const s = String(body.status ?? '');
        if (!TRIP_STATUSES.includes(s)) throw error(400, 'Bad status');
        if (trip.status !== s) await pb.collection('trips').update(trip.id, { status: s });
        break;
      }

      // Permanently delete the trip and everything under it. Every collection's
      // `trip` relation is cascadeDelete:true (see migrations), so removing the
      // trip row cascades to participants, itinerary, gear, packing, meals,
      // expenses, pins, bookings, cities, invites and notifications. Organizer
      // only — irreversible, so the client confirms first.
      case 'delete_trip': {
        if (!isOrganizer) throw error(403, 'Only organizers can delete the trip');
        await pb.collection('trips').delete(trip.id);
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
