// Shared map-pin categories (emoji + label). Lived inside MapSection; extracted
// so the route surface can label pins the same way when it projects them onto
// the elevation profile.

/** @type {ReadonlyArray<readonly [string, string, string]>} category, emoji, label */
export const PIN_CATS = /** @type {const} */ ([
  ['campsite', '🏕️', 'Campsite'],
  ['lodging', '🛏️', 'Lodging'],
  ['meetup', '📍', 'Meetup point'],
  ['parking', '🅿️', 'Parking'],
  ['trailhead', '🥾', 'Trailhead'],
  ['gas', '⛽', 'Gas'],
  ['food', '🍽️', 'Food'],
  ['water', '🚰', 'Water'],
  ['viewpoint', '🌄', 'Viewpoint'],
  ['other', '📌', 'Other']
]);

/** Emoji for a category (falls back to the last entry, "Other"). @param {string} c */
export const emojiOf = (c) => (PIN_CATS.find(([k]) => k === c) ?? PIN_CATS[PIN_CATS.length - 1])[1];

/** Human label for a category. @param {string} c */
export const labelOf = (c) => (PIN_CATS.find(([k]) => k === c) ?? PIN_CATS[PIN_CATS.length - 1])[2];

// The pin categories that sit *along a trail* (vs. trailhead-area logistics like
// parking/gas). These get projected onto the elevation profile so you can see
// where camps, water, and viewpoints fall along the climb.
export const ON_ROUTE_CATS = new Set(['campsite', 'water', 'viewpoint', 'trailhead']);
