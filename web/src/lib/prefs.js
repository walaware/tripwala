// Per-user preferences, read off the signed-in user (App.SessionUser). Each pref
// stores empty by default and normalizes to a sensible fallback here, so the app
// never has to special-case "unset". Add future prefs as small pure helpers
// beside these — one accessor + one default — and surface them in /profile.
//
// One pref lives elsewhere: `default_trip_visibility` is in $lib/visibility.js,
// beside the tier constants and the trip-side accessor it has to agree with.

/** @typedef {'F' | 'C'} TempUnit */

/** Temperature unit for the weather forecast. Default matches the app's
 * original hard-coded unit (Fahrenheit). */
export const DEFAULT_TEMP_UNIT = /** @type {TempUnit} */ ('F');

/**
 * The user's temperature unit, normalized. Anything unrecognized (incl. unset,
 * or a null/absent user for anonymous share-link viewers) falls back to F.
 * @param {{ temp_unit?: string } | null | undefined} user
 * @returns {TempUnit}
 */
export function tempUnit(user) {
  return user?.temp_unit === 'C' ? 'C' : DEFAULT_TEMP_UNIT;
}

/** Open-Meteo's `temperature_unit` query value for a given pref. */
export function openMeteoUnit(/** @type {TempUnit} */ unit) {
  return unit === 'C' ? 'celsius' : 'fahrenheit';
}

/** @typedef {'apple' | 'google'} MapApp */

/** The map app that "Navigate" links open. Default is Apple Maps — the app's
 * preferred default; anything unrecognized (incl. unset, or an anonymous
 * share-link viewer with no user) falls back to it. */
export const DEFAULT_MAP_APP = /** @type {MapApp} */ ('apple');

/**
 * The user's preferred map app, normalized. See $lib/maps.js for the link builders.
 * @param {{ map_app?: string } | null | undefined} user
 * @returns {MapApp}
 */
export function mapApp(user) {
  return user?.map_app === 'google' ? 'google' : DEFAULT_MAP_APP;
}
