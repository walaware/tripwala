import { json, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { getMembership } from '$lib/server/membership.js';
import { unfurl } from '$lib/server/unfurl.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB, matches the PB file field cap

// All planning-phase writes funnel through here (mirrors /actions): resolve the
// trip from the URL, require the signed-in user to be a member, and derive the
// acting participant from their membership. Owner-only ops check the role.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** PB date fields want a datetime; store day-granular values at UTC midnight. */
const toPb = (/** @type {string} */ d) => (DATE_RE.test(d) ? `${d} 00:00:00.000Z` : '');
/** Nights between two YYYY-MM-DD days (end − start in whole days). */
const nightsBetween = (/** @type {string} */ start, /** @type {string} */ end) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
/** Throw if [start,end] is shorter than the trip's minimum nights. */
function assertMinNights(/** @type {any} */ trip, /** @type {string} */ start, /** @type {string} */ end) {
  const min = Number(trip.min_nights) || 0;
  if (min > 0 && nightsBetween(start, end || start) < min) {
    throw error(400, `This trip needs at least ${min} night${min === 1 ? '' : 's'} — pick a longer stretch.`);
  }
}

export async function POST({ params, request, locals }) {
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
  if (me.status === 'pending') throw error(403, 'Your request to join is awaiting approval');
  const isOrganizer = me.role === 'organizer';
  const ownerOnly = () => {
    if (!isOrganizer) throw error(403, 'Organizers only');
  };

  // Most ops send JSON; image uploads send multipart/form-data (a File can't ride
  // in JSON). Parse whichever shape arrived into a plain `body` + optional file.
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

  /** Fetch a row and assert it belongs to this trip (direct `trip` relation). */
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
      case 'set_type': {
        ownerOnly();
        const t = String(body.tripType ?? '');
        await pb.collection('trips').update(trip.id, { trip_type: t });
        break;
      }

      case 'set_status': {
        ownerOnly();
        const s = String(body.status ?? '');
        if (!['planning', 'confirmed', 'completed'].includes(s)) throw error(400, 'Bad status');
        await pb.collection('trips').update(trip.id, { status: s });
        break;
      }

      case 'propose_date': {
        ownerOnly();
        const start = String(body.start ?? '');
        const end = String(body.end ?? start);
        if (!DATE_RE.test(start)) throw error(400, 'Need a start date');
        if (end && !DATE_RE.test(end)) throw error(400, 'Bad end date');
        if (end && end < start) throw error(400, 'End is before start');
        assertMinNights(trip, start, end);
        const count = (await pb.collection('date_options').getList(1, 1, { filter: pb.filter('trip = {:t}', { t: trip.id }) })).totalItems;
        await pb.collection('date_options').create({
          trip: trip.id,
          start_date: toPb(start),
          end_date: end ? toPb(end) : '',
          sort_order: count
        });
        break;
      }

      case 'remove_date': {
        ownerOnly();
        const o = await inTrip('date_options', body.optionId);
        await pb.collection('date_options').delete(o.id);
        break;
      }

      case 'vote_date': {
        const o = await inTrip('date_options', body.optionId);
        const vote = String(body.vote ?? '');
        const mine = await firstOrNull(
          'date_votes',
          pb.filter('date_option = {:o} && participant = {:p}', { o: o.id, p: me.id })
        );
        if (!vote) {
          if (mine) await pb.collection('date_votes').delete(mine.id);
        } else if (['yes', 'maybe', 'no'].includes(vote)) {
          if (mine) await pb.collection('date_votes').update(mine.id, { vote });
          else await pb.collection('date_votes').create({ date_option: o.id, participant: me.id, vote });
        }
        break;
      }

      case 'set_availability': {
        const raw = Array.isArray(body.dates) ? body.dates : [];
        const dates = [...new Set(raw.map((/** @type {any} */ d) => String(d)).filter((/** @type {string} */ d) => DATE_RE.test(d)))].slice(0, 366);
        await pb.collection('participants').update(me.id, { available_dates: dates });
        break;
      }

      case 'add_location': {
        const label = String(body.label ?? '').trim().slice(0, 200);
        if (!label) throw error(400, 'Name the place');
        const url = String(body.url ?? '').trim();
        if (url && !/^https?:\/\/.+/i.test(url)) throw error(400, 'Links need http(s)://');
        const note = String(body.note ?? '').trim().slice(0, 500);
        const idea = await pb.collection('location_ideas').create({
          trip: trip.id,
          participant: me.id,
          label,
          url: url.slice(0, 500),
          note
        });
        // Unfurl the link ONCE, here, so the card has a preview on first render.
        // Best-effort + SSRF-guarded inside unfurl(); mark fetched either way so a
        // site with no OG tags isn't retried on every load.
        if (url) {
          const preview = await unfurl(url);
          await pb.collection('location_ideas').update(idea.id, {
            preview_image: preview?.image ?? '',
            preview_title: preview?.title ?? '',
            preview_description: preview?.description ?? '',
            preview_fetched: true
          });
        }
        break;
      }

      // Upload (or replace) the card's custom picture — multipart, image only.
      // Allowed for the suggester or an organizer. Overrides the link preview.
      case 'set_location_image': {
        const idea = await inTrip('location_ideas', body.ideaId);
        if (idea.participant !== me.id && !isOrganizer) throw error(403, "That's not your idea");
        if (!imageFile) throw error(400, 'Choose an image first');
        if (!imageFile.type.startsWith('image/')) throw error(400, "That doesn't look like an image");
        if (imageFile.size > MAX_IMAGE_BYTES) throw error(400, 'Image must be under 5 MB');
        const fd = new FormData();
        fd.append('image', imageFile, imageFile.name || 'photo');
        try {
          await pb.collection('location_ideas').update(idea.id, fd);
        } catch (_) {
          throw error(400, 'Could not save that image — try a different one');
        }
        break;
      }

      case 'remove_location_image': {
        const idea = await inTrip('location_ideas', body.ideaId);
        if (idea.participant !== me.id && !isOrganizer) throw error(403, "That's not your idea");
        await pb.collection('location_ideas').update(idea.id, { image: null });
        break;
      }

      case 'remove_location': {
        const idea = await inTrip('location_ideas', body.ideaId);
        if (idea.participant !== me.id && !isOrganizer) throw error(403, "That's not your idea");
        await pb.collection('location_ideas').delete(idea.id);
        break;
      }

      case 'vote_location': {
        const idea = await inTrip('location_ideas', body.ideaId);
        const mine = await firstOrNull(
          'location_votes',
          pb.filter('location_idea = {:i} && participant = {:p}', { i: idea.id, p: me.id })
        );
        if (mine) await pb.collection('location_votes').delete(mine.id);
        else await pb.collection('location_votes').create({ location_idea: idea.id, participant: me.id });
        break;
      }

      case 'pick_location': {
        ownerOnly();
        const idea = await inTrip('location_ideas', body.ideaId);
        // Store both: the label (text, for everywhere that shows it) and a relation
        // to the idea (so the confirmed trip can surface its image/preview).
        await pb.collection('trips').update(trip.id, { location: idea.label, picked_location: idea.id });
        break;
      }

      // Lock it in: set final dates (+ optional location) and flip to confirmed.
      case 'confirm_trip': {
        ownerOnly();
        const start = String(body.start ?? '');
        const end = String(body.end ?? start);
        if (!DATE_RE.test(start)) throw error(400, 'Pick a start date to confirm');
        if (end && !DATE_RE.test(end)) throw error(400, 'Bad end date');
        if (end && end < start) throw error(400, 'End is before start');
        assertMinNights(trip, start, end);
        /** @type {Record<string, unknown>} */
        const data = { start_date: toPb(start), end_date: end ? toPb(end) : '', status: 'confirmed' };
        const loc = String(body.location ?? '').trim();
        if (loc) data.location = loc.slice(0, 300);
        await pb.collection('trips').update(trip.id, data);
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
