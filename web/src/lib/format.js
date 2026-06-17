/**
 * Format an ISO/PB date string as e.g. "Fri, Jul 17". Returns '' on empty.
 * @param {string | null | undefined} value
 */
export function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

/**
 * "Jul 17 – 19, 2026" style range for the trip header.
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 */
export function fmtDateRange(start, end) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  /** @type {Intl.DateTimeFormatOptions} */
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (s && e) {
    const sameMonth =
      s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
    const left = s.toLocaleDateString('en-US', opts);
    const right = sameMonth
      ? e.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
      : e.toLocaleDateString('en-US', opts);
    return `${left} – ${right}, ${e.getUTCFullYear()}`;
  }
  if (s) return s.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return '';
}
