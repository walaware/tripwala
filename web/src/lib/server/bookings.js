// Booking tracker logic (#4). Pure shaping + the two reminder classifiers that
// drive the cross-trip view. Writes go through the /[share_token]/actions op
// endpoint. Kept free of PocketBase specifics so the classifiers are unit-testable.

/** @param {string|undefined|null} d a PB datetime → "YYYY-MM-DD" */
const dateOnly = (d) => String(d ?? '').slice(0, 10);

/** Booking types and the enums we accept, mirrored from the migration. */
export const BOOKING_TYPES = ['flight', 'stay', 'car', 'other'];
export const BOOKING_STATUSES = ['planning', 'booked', 'confirmed'];
export const REFUND_STATES = ['unknown', 'refundable', 'nonrefundable'];

/**
 * @typedef {Object} Booking
 * @property {string} id
 * @property {string} tripId
 * @property {string} type
 * @property {string} title
 * @property {string} status
 * @property {string} refundable
 * @property {string} refund_deadline  YYYY-MM-DD ('' if unset)
 * @property {string} start_date       YYYY-MM-DD ('' if unset)
 * @property {string} end_date         YYYY-MM-DD ('' if unset)
 * @property {number|null} cost
 * @property {string} currency
 * @property {string} confirmation
 * @property {string} link
 * @property {string} notes
 * @property {string|null} addedBy      participant id
 */

/**
 * Shape one raw booking row for the client.
 * @param {any} b
 * @returns {Booking}
 */
export function shapeBooking(b) {
  return {
    id: b.id,
    tripId: b.trip,
    type: BOOKING_TYPES.includes(b.type) ? b.type : 'other',
    title: b.title ?? '',
    status: BOOKING_STATUSES.includes(b.status) ? b.status : 'planning',
    refundable: REFUND_STATES.includes(b.refundable) ? b.refundable : 'unknown',
    refund_deadline: dateOnly(b.refund_deadline),
    start_date: dateOnly(b.start_date),
    end_date: dateOnly(b.end_date),
    cost: b.cost === '' || b.cost === null || b.cost === undefined ? null : Number(b.cost),
    currency: b.currency ?? '',
    confirmation: b.confirmation ?? '',
    link: b.link ?? '',
    notes: b.notes ?? '',
    addedBy: b.added_by || null
  };
}

/**
 * Shape + order a trip's bookings: by start_date (dated first, chronological),
 * then undated by title. Stable enough for the per-trip section.
 * @param {Array<any>} rows
 * @returns {Booking[]}
 */
export function shapeBookings(rows) {
  return rows.map(shapeBooking).sort((a, b) => {
    if (a.start_date && b.start_date) return a.start_date.localeCompare(b.start_date);
    if (a.start_date) return -1;
    if (b.start_date) return 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Load a trip's bookings. Missing collection (pre-migration) yields an empty
 * list so the trip still renders.
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} tripId
 * @returns {Promise<Booking[]>}
 */
export async function loadBookings(pb, tripId) {
  try {
    const rows = await pb
      .collection('bookings')
      .getFullList({ filter: pb.filter('trip = {:t}', { t: tripId }) });
    return shapeBookings(rows);
  } catch (_) {
    return [];
  }
}

/**
 * Every booking across the trips a user belongs to, each enriched with its
 * trip's name + share_token so the cross-trip view can link back. Used by the
 * `/bookings` reminders page (#4). Tolerates the collection's absence.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @returns {Promise<Array<Booking & { tripName: string, tripToken: string }>>}
 */
export async function loadUserBookings(pb, userId) {
  if (!userId) return [];
  // Active memberships → the trips whose bookings this user should see.
  const memberships = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('user = {:u}', { u: userId }), expand: 'trip' });
  /** @type {Map<string, any>} */
  const tripById = new Map();
  for (const m of memberships) {
    if (m.status === 'pending') continue; // not a member yet
    const t = m.expand?.trip;
    if (t) tripById.set(t.id, t);
  }
  if (!tripById.size) return [];

  const filter = [...tripById.keys()].map((id) => pb.filter('trip = {:t}', { t: id })).join(' || ');
  /** @type {any[]} */
  let rows = [];
  try {
    rows = await pb.collection('bookings').getFullList({ filter });
  } catch (_) {
    return []; // collection absent (pre-migration) or transient
  }
  return shapeBookings(rows).map((b) => {
    const t = tripById.get(b.tripId);
    return { ...b, tripName: t?.name ?? 'Trip', tripToken: t?.share_token ?? '' };
  });
}

/**
 * A booking still needs to be booked — the "what's pending?" reminder. Anything
 * not yet in a firm state (booked/confirmed) counts.
 * @param {Booking} b
 */
export function isPending(b) {
  return b.status === 'planning';
}

/**
 * Money you could still recoup by cancelling/changing — the "can I get my money
 * back?" reminder. A booking qualifies when it's marked refundable and its
 * refund deadline is today or later (relative to `today`, a YYYY-MM-DD). A
 * refundable booking with no deadline is treated as still-recoupable.
 * @param {Booking} b
 * @param {string} today YYYY-MM-DD
 */
export function isRecoupable(b, today) {
  if (b.refundable !== 'refundable') return false;
  if (b.status === 'planning') return false; // nothing paid yet to recoup
  if (!b.refund_deadline) return true;
  return b.refund_deadline >= dateOnly(today);
}
