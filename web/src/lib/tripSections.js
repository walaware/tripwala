// Shared trip-section registry (the redesign's rail modules + house-question
// titles) and the shell section-nav builder. Used by TripView (the dashboard/
// hub nav, in-page scrollSpy anchors) and by the Trip settings screen (which
// links back into the trip route + section, since it's a separate route).

/** The rail modules, in dashboard order. Itinerary is the main column (added
 * separately); Overview/Photos are handled by the nav builder. */
export const RAIL_MODULES = [
  { key: 'crew', emoji: '🙌', title: "Who's coming?", nav: 'Members' },
  { key: 'bookings', emoji: '🎫', title: "What's booked?", nav: 'Bookings' },
  { key: 'map', emoji: '🗺️', title: 'Pins & places', nav: 'Map' },
  // One surface for everything to bring: the group's list (claimable) plus your
  // own pack. Previously split across 'packing' and 'gear', whose titles both
  // promised "the stuff to bring" and competed for the same meaning.
  { key: 'gear', emoji: '🎒', title: 'What to bring', nav: 'Gear' },
  { key: 'food', emoji: '🍳', title: "Who's cooking?", nav: 'Food' },
  { key: 'expenses', emoji: '💸', title: 'Who paid what?', nav: 'Expenses' }
];

/**
 * Build the shell's contextual section nav for a trip: Overview · Itinerary ·
 * the visible rail modules · Photos (when linked). Hidden sections drop out.
 *
 * @param {{ hidden_sections?: string[], photo_album_url?: string }} trip
 * @param {string} [hrefBase]  '' → in-page anchors (`#itinerary`, for scrollSpy on
 *   the trip route); `/{token}` → absolute links (from the settings route).
 * @returns {import('@walaware/design').NavItem[]}
 */
export function tripSectionNav(trip, hrefBase = '') {
  const hidden = new Set(trip.hidden_sections ?? []);
  const hasPhotos = !!(trip.photo_album_url || '').trim();
  /** @type {import('@walaware/design').NavItem[]} */
  const nav = [{ key: 'overview', label: 'Overview', icon: '✨', href: `${hrefBase}#overview` }];
  if (!hidden.has('itinerary')) nav.push({ key: 'itinerary', label: 'Itinerary', icon: '🗓️', href: `${hrefBase}#itinerary` });
  for (const r of RAIL_MODULES) {
    if (!hidden.has(r.key)) nav.push({ key: r.key, label: r.nav, icon: r.emoji, href: `${hrefBase}#${r.key}` });
  }
  if (hasPhotos && !hidden.has('photos')) nav.push({ key: 'photos', label: 'Photos', icon: '📷', href: `${hrefBase}#photos` });
  // Settings sits last, as a route link — so it reads as this trip's settings at
  // the bottom of the section list, not an app-level gear. Only added in absolute
  // mode (from the settings route); the in-page/anchor caller adds its own so the
  // link never resolves to the global `/settings`.
  if (hrefBase) nav.push({ key: 'tripsettings', label: 'Settings', icon: '⚙️', href: `${hrefBase}/settings` });
  return nav;
}
