// One vocabulary for "where does this person stand on the trip", shared by the
// compact Who's-in card and the People page so a badge always means the same
// thing in both places.
//
// It spans two things the app used to keep separate: the RSVP answers of people
// who are already on the trip, and the people who've been asked but aren't on it
// yet (email invites + friend invitations). "Invited" is a status like any other
// — that's the whole point, otherwise outstanding invites stay invisible.

/** @typedef {'going' | 'maybe' | 'out' | 'no_answer' | 'invited'} PersonStatus */

/** Chip tones, from @walaware/design. */
/** @typedef {'neutral' | 'coral' | 'sun' | 'berry' | 'leaf' | 'danger'} Tone */

/** @type {Record<PersonStatus, { key: PersonStatus, emoji: string, label: string, tone: Tone }>} */
export const STATUS = {
  going: { key: 'going', emoji: '🔥', label: 'Going', tone: 'leaf' },
  maybe: { key: 'maybe', emoji: '🤔', label: 'Maybe', tone: 'sun' },
  out: { key: 'out', emoji: '💤', label: "Can't make it", tone: 'neutral' },
  // Coral (the accent) on purpose: the people who've said nothing are the ones
  // worth chasing, so they shouldn't fade into the background.
  no_answer: { key: 'no_answer', emoji: '⏳', label: 'Not answered yet', tone: 'coral' },
  invited: { key: 'invited', emoji: '✉️', label: 'Invited, not joined', tone: 'coral' }
};

/** Order statuses are summarised in — most-committed first, outstanding last. */
export const STATUS_ORDER = /** @type {PersonStatus[]} */ ([
  'going',
  'maybe',
  'out',
  'no_answer',
  'invited'
]);

/**
 * The status of someone already on the trip. A participant who has never
 * answered has a null `rsvp_status` — that's `no_answer`, not "out".
 *
 * @param {{ rsvp_status?: string | null } | null | undefined} p
 */
export function statusOf(p) {
  const key = /** @type {PersonStatus} */ (p?.rsvp_status ?? '');
  return STATUS[key] ?? STATUS.no_answer;
}

/**
 * Headcount per status. `invited` is counted from the outstanding invite lists
 * rather than from participants, since those people have no participant row yet.
 *
 * @param {Array<{ rsvp_status?: string | null }>} participants
 * @param {number} [invitedCount]
 * @returns {Record<PersonStatus, number>}
 */
export function countByStatus(participants, invitedCount = 0) {
  const out = { going: 0, maybe: 0, out: 0, no_answer: 0, invited: invitedCount };
  for (const p of participants) out[statusOf(p).key] += 1;
  return out;
}

/**
 * A one-line "4 going · 2 maybe · 3 invited" summary. Zero-count statuses are
 * dropped so the line stays short on a small card.
 *
 * @param {Record<PersonStatus, number>} counts
 * @returns {Array<{ key: PersonStatus, count: number, label: string, tone: Tone }>}
 */
export function summarise(counts) {
  return STATUS_ORDER.filter((k) => counts[k] > 0).map((k) => ({
    key: k,
    count: counts[k],
    label: STATUS[k].label,
    tone: STATUS[k].tone
  }));
}
