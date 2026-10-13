// Trip pages: member-supplied HTML views (e.g. a Claude artifact) attached to a
// trip. Pure validation/shaping plus the security headers the serve route uses.
//
// THE SECURITY MODEL (don't weaken it): the stored HTML is arbitrary and
// member-authored, so it must never execute with the app's origin authority —
// that would be stored XSS straight into trip sessions. It is served ONLY via
// the members-only /[share_token]/page/[id] route with `Content-Security-Policy:
// sandbox allow-scripts allow-popups`: the document gets an OPAQUE origin, so
// document.cookie is unreadable, same-origin fetches to tripwala are blocked by
// CORS, and localStorage is walled off — while the page's own scripts/styles
// still run (CDN scripts and images load fine). The viewer iframe repeats the
// same sandbox attribute as a second, independent layer.

/** Max stored page size — mirrors the migration's field cap. */
export const PAGE_HTML_MAX = 1500000;
export const PAGE_TITLE_MAX = 120;

/**
 * Validate a page add/update body.
 * @param {any} body
 * @returns {{ ok: true, title: string, html: string } | { ok: false, error: string }}
 */
export function validatePage(body) {
  const title = String(body?.title ?? '').trim().slice(0, PAGE_TITLE_MAX);
  if (!title) return { ok: false, error: 'Give the page a title' };
  const html = String(body?.html ?? '');
  if (!html.trim()) return { ok: false, error: 'Paste the page’s HTML' };
  if (html.length > PAGE_HTML_MAX) {
    return { ok: false, error: `That page is too big (max ${Math.floor(PAGE_HTML_MAX / 1000)} KB)` };
  }
  return { ok: true, title, html };
}

/**
 * Response headers for serving a stored page. `sandbox` (without
 * allow-same-origin) is the load-bearing directive — see the module comment.
 */
export function pageResponseHeaders() {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': 'sandbox allow-scripts allow-popups',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
    'cache-control': 'private, no-store'
  };
}

/**
 * Shape a trip's page rows for the client — metadata only, never the HTML
 * (it's fetched by the iframe, not shipped with the trip payload).
 * @param {Array<any>} rows
 * @returns {Array<{ id: string, title: string, addedBy: string | null, updated: string }>}
 */
export function shapePages(rows) {
  return (rows ?? [])
    .map((r) => ({
      id: r.id,
      title: r.title ?? '',
      addedBy: r.added_by || null,
      updated: String(r.updated ?? '').slice(0, 10)
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
