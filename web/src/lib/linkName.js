// Derive a human-readable name from a trail/link URL, for when OG unfurl gets
// nothing (many outdoor sites sit behind Cloudflare and block server fetches).
// e.g. https://www.alltrails.com/trail/us/california/big-pine-lakes-trail
//   → trailNameFromUrl → "Big Pine Lakes Trail",  hostLabel → "alltrails.com".
// Pure + unit-tested.

/** Strip a leading "www." from a hostname. */
function bareHost(/** @type {string} */ h) {
  return h.replace(/^www\./i, '');
}

/**
 * A clean, title-cased name from the URL's last meaningful path segment.
 * Returns '' when the path has nothing wordy to offer (caller falls back to the
 * host). Never throws on a bad URL.
 * @param {string} rawUrl
 * @returns {string}
 */
export function trailNameFromUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch (_) {
    return '';
  }
  const segs = u.pathname.split('/').map((s) => s.trim()).filter(Boolean);
  // Walk from the last segment back to the first wordy one (skip pure ids/hashes).
  for (let i = segs.length - 1; i >= 0; i--) {
    let seg = segs[i];
    try {
      seg = decodeURIComponent(seg);
    } catch (_) {
      /* keep raw */
    }
    seg = seg.replace(/\.(html?|php|aspx)$/i, ''); // drop a file extension
    seg = seg.replace(/-\d{3,}$/, ''); // drop a trailing "-123456" id
    const words = seg.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = words.split(' ');
    // Accept a real name: multiple words, OR a single pure-alphabetic word of
    // 3+ chars. Rejects bare ids/hashes like "4F2A" or "m" (single, has digits
    // or too short) so we fall back past them to a wordier segment.
    const wordy = parts.length >= 2 || (parts.length === 1 && /^[a-z]{3,}$/i.test(parts[0]));
    if (!wordy) continue;
    const titled = words
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
    return titled.slice(0, 120);
  }
  return '';
}

/** The site label for a URL's host (no www), or '' on a bad URL. */
export function hostLabel(/** @type {string} */ rawUrl) {
  try {
    return bareHost(new URL(String(rawUrl)).hostname);
  } catch (_) {
    return '';
  }
}

/**
 * Best display name for a linked trail: the unfurled OG title if we got one,
 * else a name derived from the URL, else the host, else the raw URL.
 * @param {string} url
 * @param {string} [ogTitle]
 * @returns {string}
 */
export function linkDisplayName(url, ogTitle = '') {
  const t = String(ogTitle || '').trim();
  if (t) return t.slice(0, 120);
  return trailNameFromUrl(url) || hostLabel(url) || String(url || '');
}
