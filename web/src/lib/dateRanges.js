// Availability is stored as a flat set of `YYYY-MM-DD` days
// (`participants.available_dates`), but people think in stretches: "I'm free
// the 3rd through the 9th". These two functions are the seam — the calendar
// speaks ranges, the wire keeps days, and the group heatmap keeps counting
// days without knowing anything changed.

/** @param {string} iso @param {number} n */
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Every day from `start` to `end`, inclusive. Returns `[]` when `end` precedes
 * `start`. Capped so a fat-fingered range can't spin forever.
 *
 * @param {string} start `YYYY-MM-DD`
 * @param {string} end `YYYY-MM-DD`
 * @returns {string[]}
 */
export function expandRange(start, end) {
  if (!start) return [];
  const last = end || start;
  if (last < start) return [];
  /** @type {string[]} */
  const out = [];
  for (let d = start; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Collapse a set of days into the fewest inclusive ranges — consecutive
 * calendar days merge, gaps split. Input order doesn't matter; duplicates are
 * ignored.
 *
 * @param {Iterable<string>} days `YYYY-MM-DD` values
 * @returns {Array<{ start: string, end: string }>}
 */
export function groupDays(days) {
  const sorted = [...new Set(days)].sort();
  /** @type {Array<{ start: string, end: string }>} */
  const out = [];
  for (const day of sorted) {
    const open = out[out.length - 1];
    if (open && addDays(open.end, 1) === day) open.end = day;
    else out.push({ start: day, end: day });
  }
  return out;
}

/**
 * Toggle a range against a set of days: if every day in the range is already
 * present the range is cleared, otherwise it's filled in. This is what makes
 * tapping your own free stretch a second time remove it.
 *
 * @param {Iterable<string>} days the current set
 * @param {string} start `YYYY-MM-DD`
 * @param {string} end `YYYY-MM-DD`
 * @returns {string[]} a new, sorted set — the input is never mutated
 */
export function toggleRange(days, start, end) {
  const span = expandRange(start, end);
  if (!span.length) return [...new Set(days)].sort();
  const current = new Set(days);
  const allPresent = span.every((d) => current.has(d));
  const next = new Set(current);
  for (const d of span) {
    if (allPresent) next.delete(d);
    else next.add(d);
  }
  return [...next].sort();
}
