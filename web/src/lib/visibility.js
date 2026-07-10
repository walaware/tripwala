// Calendar-visibility tiers, shared by the server projection, the trip settings
// UI, and the New-trip form. Mirrors the `trips.visibility` /
// `users.default_trip_visibility` selects (see the 1718603300 migration).
//
// Read the two "empty" rules carefully — they differ on purpose:
//   - an EXISTING trip with no visibility is PRIVATE (never retroactively share
//     a trip someone created before this feature existed);
//   - a NEW trip, when its creator has expressed no preference, defaults to
//     FRIENDS (otherwise friends' calendars stay empty and the feature looks
//     broken).

/** @typedef {'private' | 'busy' | 'friends'} Visibility */

/** @type {Visibility[]} */
export const VISIBILITY_TIERS = ['private', 'busy', 'friends'];

/** What a new trip gets when its creator has set no preference. */
export const DEFAULT_NEW_TRIP_VISIBILITY = /** @type {Visibility} */ ('friends');

/** @param {unknown} v @returns {v is Visibility} */
export const isVisibility = (v) => VISIBILITY_TIERS.includes(/** @type {any} */ (v));

/**
 * A trip's effective visibility. Empty/unknown → 'private'.
 * @param {Record<string, any> | null | undefined} trip a trips record (or any shape carrying `visibility`)
 * @returns {Visibility}
 */
export function tripVisibility(trip) {
  const v = trip?.visibility;
  return isVisibility(v) ? v : 'private';
}

/**
 * The visibility a new trip should default to for this user. Empty/unknown →
 * DEFAULT_NEW_TRIP_VISIBILITY.
 * @param {Record<string, any> | null | undefined} user a users record
 * @returns {Visibility}
 */
export function defaultTripVisibility(user) {
  const v = user?.default_trip_visibility;
  return isVisibility(v) ? v : DEFAULT_NEW_TRIP_VISIBILITY;
}

/** Tiers a friend can see at all (anything but private). */
export const SHARED_TIERS = /** @type {Visibility[]} */ (['busy', 'friends']);

/**
 * Copy for the tier pickers — one place, so /new and trip settings agree.
 * @type {ReadonlyArray<{ value: Visibility, label: string, hint: string }>}
 */
export const VISIBILITY_CHOICES = [
  { value: 'private', label: 'Private', hint: 'Only people you invite see this trip.' },
  { value: 'busy', label: 'Busy only', hint: "Friends see the dates you're away — not where or what." },
  { value: 'friends', label: 'Name & place', hint: 'Friends see the trip name, dates and location.' }
];
