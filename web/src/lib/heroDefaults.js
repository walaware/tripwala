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

/** @param {Record<string, string>} mods */
const byType = (mods) =>
  Object.fromEntries(
    Object.entries(mods).map(([path, url]) => [
      (path.split('/').pop() || '').replace(/\.[^.]+$/, ''),
      url
    ])
  );

/** Full-frame artwork — used by the dashboard card wash. */
const DEFAULTS = byType(
  /** @type {Record<string, string>} */ (
    import.meta.glob('./assets/hero/*.{webp,jpg,jpeg,png,avif}', {
      eager: true,
      query: '?url',
      import: 'default'
    })
  )
);

/**
 * Banner-shaped crops, generated from the full artwork by
 * `node scripts/build-hero-banners.mjs`. The trip banner is roughly 9:1 while
 * the source art is about 2.4:1 — dropping one into the other shows barely a
 * quarter of the image and slices through the middle of the composition. These
 * pre-cut bands avoid that. Run the script after adding or regenerating art.
 */
const BANNERS = byType(
  /** @type {Record<string, string>} */ (
    import.meta.glob('./assets/hero/banner/*.{webp,jpg,jpeg,png,avif}', {
      eager: true,
      query: '?url',
      import: 'default'
    })
  )
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

/**
 * The banner-shaped default for a trip type. Falls back to the full-frame image
 * when no crop has been generated, so a missing build step degrades to the old
 * (over-cropped) behaviour rather than to nothing at all.
 *
 * @param {string | null | undefined} tripType
 * @returns {string}
 */
export function heroBannerSrc(tripType) {
  const t = String(tripType ?? '').trim();
  return BANNERS[t] || BANNERS.other || heroDefaultSrc(t);
}

/** Whether any generated artwork has been added yet. */
export const hasHeroDefaults = Object.keys(DEFAULTS).length > 0;
