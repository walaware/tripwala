// Shared coordinate helpers. PocketBase number fields default to 0, so a trip
// that never had a place picked reads back as lat=0/lng=0. Null Island (0,0) is
// open ocean in the Gulf of Guinea — no real trip is there — so we treat exactly
// (0, 0) as "unset" and every other finite pair as a real, picked location.

/**
 * Does this trip carry real, picked coordinates (vs. the 0,0 default)?
 * @param {unknown} lat
 * @param {unknown} lng
 * @returns {boolean}
 */
export function hasCoords(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    a >= -90 &&
    a <= 90 &&
    b >= -180 &&
    b <= 180 &&
    !(a === 0 && b === 0)
  );
}

/**
 * Clamp a value into a numeric range, or return null if it isn't a finite number.
 * @param {unknown} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number | null}
 */
export function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}
