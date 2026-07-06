// Per-user preferences, read off the signed-in user (App.SessionUser). Each pref
// stores empty by default and normalizes to a sensible fallback here, so the app
// never has to special-case "unset". Add future prefs as small pure helpers
// beside these — one accessor + one default — and surface them in /profile.

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
