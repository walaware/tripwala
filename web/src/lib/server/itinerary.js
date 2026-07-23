// Pure shaping for the itinerary timeline (#18 + #17).
//
// Turns raw PocketBase rows (items + item-level votes) into the serializable list
// the ItinerarySection renders. Items are either "fixed" (a confirmed schedule
// entry — not votable) or "flexible" (an optional suggestion the crew upvotes
// directly). Kept dependency-free so it's unit-testable without a DB (see
// itinerary.test.js); the async loads live in loadTrip.js.

/** @param {string|undefined|null} d a PB datetime → "YYYY-MM-DD" */
const dateOnly = (d) => String(d ?? '').slice(0, 10);

/**
 * Same-origin URL for an item's uploaded picture (PB serves it at
 * /api/files/{collection}/{id}/{file}; Caddy proxies it). Kept inline here — a
 * plain string build — so this module stays dependency-free and unit-testable.
 * '416x224' matches the field's thumb size (see the itinerary_media migration).
 * @param {{ id: string, image?: string | null }} it
 */
const itemImageUrl = (it) =>
  it.image ? `/api/files/itinerary_items/${it.id}/${encodeURIComponent(it.image)}?thumb=416x224` : '';

/**
 * @param {Array<any>} items  itinerary_items rows (trip, date, time, label, kind, sort_order, created_by)
 * @param {Array<any>} votes  itinerary_votes rows (itinerary_item, participant)
 * @param {Record<string,string>} nameById    participant id → display name
 * @param {Record<string,string>} avatarById  participant id → avatar URL ('' if none)
 * @param {string|null} myParticipantId       the viewer's participant (for `mine`)
 */
export function shapeItinerary(items, votes, nameById, avatarById, myParticipantId) {
  // item id → { count, mine }
  /** @type {Record<string, { count: number, mine: boolean }>} */
  const tally = {};
  for (const it of items) tally[it.id] = { count: 0, mine: false };
  for (const v of votes) {
    const t = tally[v.itinerary_item];
    if (!t) continue; // vote for a deleted item
    t.count++;
    if (myParticipantId && v.participant === myParticipantId) t.mine = true;
  }

  const shaped = items.map((it) => ({
    id: it.id,
    date: dateOnly(it.date),
    time: it.time || '',
    label: it.label || '',
    // Optional map destination — drives the "Navigate" deep link (see $lib/maps.js).
    place: it.place || '',
    // Optional longer detail, shown wrapped beneath the short label.
    note: it.note || '',
    // Rich media (#to-decide-cards): an optional link + picture + cached link
    // preview, mirroring planning's location cards. Custom image wins over the
    // unfurled og:image at render time (see cardImage in $lib/locationCard.js).
    url: it.url || '',
    image: itemImageUrl(it),
    previewImage: it.preview_image || '',
    previewTitle: it.preview_title || '',
    previewDescription: it.preview_description || '',
    // Default empty/legacy kind to 'flexible' (pre-v2 items were votable).
    // 'question' groups a decision ("Where to camp?"); its options are the
    // flexible rows pointing at it via `group` (see the itinerary_groups migration).
    kind: it.kind === 'fixed' ? 'fixed' : it.kind === 'question' ? 'question' : 'flexible',
    // The question this row is an option of (null for questions + standalone items).
    group: it.group || null,
    // Organizer ruled this option out (#cross-option): kept for reference but
    // struck through, shrunk, and sorted to the bottom of its question.
    crossed: !!it.crossed,
    sortOrder: it.sort_order ?? 0,
    createdBy: it.created_by || null,
    createdByName: it.created_by ? (nameById[it.created_by] ?? 'Someone') : null,
    createdByAvatar: it.created_by ? (avatarById[it.created_by] ?? '') : '',
    votes: tally[it.id].count,
    mine: tally[it.id].mine
  }));

  // Dated items first (chronological), undated "to decide" last. Within a day:
  // fixed entries before flexible suggestions, then by sort_order (insertion).
  const kindRank = (/** @type {string} */ k) => (k === 'fixed' ? 0 : 1);
  shaped.sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : 1;
    }
    if (a.kind !== b.kind) return kindRank(a.kind) - kindRank(b.kind);
    return a.sortOrder - b.sortOrder;
  });
  return shaped;
}

export { dateOnly };
