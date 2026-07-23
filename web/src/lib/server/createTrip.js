// Shared trip creation: mint a unique friendly slug, create the trip, make the
// creator an organizer member, and (best-effort) scaffold meal slots + an Immich
// album. Used by both the full New-trip form and the Ideas quick-add, so the two
// paths can't drift. Idea-stage trips (status='idea') just pass a name.

import { generateOwnerToken, generateInviteToken } from './tokens.js';
import { generateSlug } from './slug.js';
import { generateSlotsFromDates } from './mealSlots.js';
import { joinTrip } from './membership.js';
import { immichConfigured, createTripAlbum } from './immich.js';
import { isVisibility, defaultTripVisibility } from '../visibility.js';

/** All statuses a trip can be created in (idea = a "someday" wishlist entry). */
export const TRIP_STATUSES = ['idea', 'planning', 'confirmed', 'completed'];

/** Raised when a trip couldn't be persisted after slug-collision retries. */
export class TripCreateError extends Error {}

/** @param {string} s */
export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** YYYY-MM-DD → PB datetime at UTC midnight; empty stays empty. @param {string} d */
const toPb = (d) => (d ? `${d} 00:00:00.000Z` : '');

/**
 * @typedef {Object} NewTripInput
 * @property {string} name
 * @property {string} [location]
 * @property {string} [start_date]   YYYY-MM-DD
 * @property {string} [end_date]     YYYY-MM-DD
 * @property {string} [description]  raw text (wrapped + escaped into HTML)
 * @property {string} [expense_link]
 * @property {string} [status]       one of TRIP_STATUSES; defaults 'confirmed'
 * @property {string} [trip_type]
 * @property {boolean} [create_album]
 * @property {string} [visibility]   friends-calendar tier; omitted → the creator's default
 */

/**
 * Create a trip and enroll the creator as organizer.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ id: string, name: string, email?: string, default_trip_visibility?: string }} user
 * @param {NewTripInput} input
 * @returns {Promise<{ trip: any, share_token: string, owner_token: string, mealSlots: number, albumRequested: boolean, albumCreated: boolean }>}
 */
export async function createTrip(pb, user, input) {
  const status = TRIP_STATUSES.includes(input.status ?? '') ? input.status : 'confirmed';
  const start_date = input.start_date ?? '';
  const end_date = input.end_date ?? '';
  const owner_token = generateOwnerToken();
  // Explicit choice wins; otherwise fall back to the creator's saved preference.
  // Unlike an existing trip (empty → private), a NEW trip is friend-visible
  // unless its creator has said otherwise — see $lib/visibility.js.
  const visibility = isVisibility(input.visibility)
    ? input.visibility
    : defaultTripVisibility(user);

  const base = {
    name: input.name,
    location: input.location ?? '',
    start_date: toPb(start_date),
    end_date: toPb(end_date),
    description: input.description ? `<p>${escapeHtml(input.description)}</p>` : '',
    expense_link: input.expense_link ?? '',
    owner_token,
    // Separate join capability from the view-only share slug (#2).
    invite_token: generateInviteToken(),
    created_by: user.id,
    status,
    trip_type: input.trip_type ?? '',
    visibility
  };

  // Friendly slug (<trip-word>-<word>-<word>-<word>). Three random words (~19
  // bits) so an invite link isn't trivially guessable. On the rare collision,
  // retry with progressively more words.
  /** @type {any} */
  let trip;
  let share_token = '';
  for (let attempt = 0; attempt < 6 && !trip; attempt++) {
    share_token = generateSlug(input.name, attempt + 1);
    try {
      trip = await pb.collection('trips').create({ ...base, share_token });
    } catch (/** @type {any} */ err) {
      const isCollision = err?.status === 400 || err?.response?.data?.share_token;
      if (isCollision && attempt < 5) continue;
      throw new TripCreateError('Could not create the trip');
    }
  }
  if (!trip) throw new TripCreateError('Could not create the trip');

  // The creator is automatically an organizer member.
  try {
    await joinTrip(pb, trip, user);
  } catch (_) {
    // non-fatal; they can claim via the owner link if this hiccups
  }

  // Best-effort: auto-generate meal slots from the date range. A failure here
  // must not lose the trip just created, so it is non-fatal. (Ideas have no
  // dates, so this is a no-op for them.)
  const slots = generateSlotsFromDates(start_date, end_date);
  if (slots.length) {
    try {
      await Promise.all(slots.map((s) => pb.collection('meal_slots').create({ trip: trip.id, ...s })));
    } catch (_) {
      // slots can be regenerated/edited later; ignore
    }
  }

  // Opt-in shared Immich album. Best-effort — a failure must never lose the trip.
  let albumCreated = false;
  const albumRequested = Boolean(input.create_album);
  if (albumRequested && (await immichConfigured())) {
    try {
      const { albumId, albumUrl } = await createTripAlbum(trip);
      await pb.collection('trips').update(trip.id, { photo_album_id: albumId, photo_album_url: albumUrl });
      albumCreated = true;
    } catch (_) {
      // non-fatal; surfaced as albumCreated:false so the UI can hint
    }
  }

  return { trip, share_token, owner_token, mealSlots: slots.length, albumRequested, albumCreated };
}
