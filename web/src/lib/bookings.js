// Client-side display helpers for the booking tracker (#4) — labels, emoji and
// badge classes for a booking's type / status / refundability, plus money
// formatting. Kept separate from $lib/server/bookings.js (which holds the
// server shaping + reminder classifiers) so components can import it safely.

/** @param {string} type */
export function bookingTypeMeta(type) {
  switch (type) {
    case 'flight':
      return { emoji: '✈️', label: 'Flight' };
    case 'stay':
      return { emoji: '🏨', label: 'Stay' };
    case 'car':
      return { emoji: '🚗', label: 'Car' };
    default:
      return { emoji: '🎫', label: 'Other' };
  }
}

/** @param {string} status */
export function statusMeta(status) {
  switch (status) {
    case 'booked':
      return { label: '✅ Booked', cls: 'bg-sky-100 text-sky-700' };
    case 'confirmed':
      return { label: '🔒 Confirmed', cls: 'bg-emerald-100 text-emerald-700' };
    default:
      return { label: '🕐 Planning', cls: 'bg-amber-100 text-amber-700' };
  }
}

/** @param {string} refundable */
export function refundMeta(refundable) {
  switch (refundable) {
    case 'refundable':
      return { emoji: '↩', label: 'Refundable', cls: 'text-emerald-700' };
    case 'nonrefundable':
      return { emoji: '🚫', label: 'Non-refundable', cls: 'text-berry-600' };
    default:
      return { emoji: '❔', label: 'Refund unknown', cls: 'text-cocoa-400' };
  }
}

/**
 * Format a cost with an optional currency. Whole numbers drop the decimals;
 * otherwise two places. Currency (e.g. "USD", "€") is shown as a prefix.
 * @param {number|null|undefined} amount
 * @param {string} [currency]
 */
export function fmtMoney(amount, currency = '') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '';
  const n = Number(amount);
  const body = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const cur = String(currency || '').trim();
  return cur ? `${cur} ${body}` : body;
}
