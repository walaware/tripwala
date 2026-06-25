// Shared presentation helpers for location cards (planning row + confirmed
// expanded card). A custom uploaded image always wins over the unfurled link
// preview; with neither, callers fall back to a placeholder.

/**
 * @param {{ image?: string, previewImage?: string }} loc
 * @returns {{ src: string, isCustom: boolean }}
 */
export function cardImage(loc) {
  if (loc?.image) return { src: loc.image, isCustom: true };
  if (loc?.previewImage) return { src: loc.previewImage, isCustom: false };
  return { src: '', isCustom: false };
}

/** Bare domain for a link (drops www.), or '' if the URL is unusable. */
export function cardDomain(/** @type {string | undefined} */ url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

/** A stable-ish accent index (0–4) from a string, for placeholder tints. */
export function tintIndex(/** @type {string} */ seed) {
  const s = String(seed || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i)) % 5;
  return n;
}
