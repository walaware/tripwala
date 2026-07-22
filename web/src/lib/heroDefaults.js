// Generated default trip artwork, one image per trip type.
//
// ── Adding the artwork ───────────────────────────────────────────────────────
// Drop one file per trip type into `src/lib/assets/hero/`, named for the type:
//
//   camping  backpacking  road_trip  cabin  ski  beach  city  festival  other
//
// e.g. `src/lib/assets/hero/camping.webp`. `.jpg` / `.png` / `.avif` work too.
//
// They're picked up automatically — the glob below only ever sees files that
// exist, so a type with no artwork yet degrades to the emoji tile instead of
// 404ing, and you can add them one at a time. Vite fingerprints and hashes the
// output, so they cache forever.
//
// Suggested output from the generation pipeline: 3:1 aspect (the trip banner
// crops to roughly 1600×540; the dashboard card reuses the same file as a faint
// wash behind its text). Keep the subject mass low and centre-left — the trip
// name sits over the left of the banner, and the card wash is masked out on its
// left edge to protect the title's contrast.
//
// This module is Vite-only (`import.meta.glob` is a compile-time transform).
// Keep it out of anything that needs to run under plain node — the pure
// precedence logic lives in $lib/tripHero.js for exactly that reason.

/** @type {Record<string, string>} */
const DEFAULTS = Object.fromEntries(
  Object.entries(
    /** @type {Record<string, string>} */ (
      import.meta.glob('./assets/hero/*.{webp,jpg,jpeg,png,avif}', {
        eager: true,
        query: '?url',
        import: 'default'
      })
    )
  ).map(([path, url]) => [(path.split('/').pop() || '').replace(/\.[^.]+$/, ''), url])
);

/**
 * The generated default for a trip type, or '' if that artwork isn't present.
 * Unknown or blank types fall back to the `other` artwork when it exists.
 *
 * @param {string | null | undefined} tripType
 * @returns {string}
 */
export function heroDefaultSrc(tripType) {
  const t = String(tripType ?? '').trim();
  return DEFAULTS[t] || DEFAULTS.other || '';
}

/** Whether any generated artwork has been added yet. */
export const hasHeroDefaults = Object.keys(DEFAULTS).length > 0;
