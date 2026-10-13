# Trip pages — embedded HTML views

Members can attach arbitrary self-contained HTML pages to a trip (a Claude
artifact, a hand-made schedule, a game) and every member can open them
full-screen from the **📄 Pages** module. The point is to let fun, designed
one-off pages live on the trip without tripwala having to model them.

## Security model (the part that must not be weakened)

The HTML is member-authored and completely untrusted. If it ever executed with
the app origin's authority it would be stored XSS straight into trip sessions
(`pb_auth` theft, actions as the viewer). So:

1. **Never rendered on the app's DOM.** The stored HTML is served only by
   `/[share_token]/page/[id]` (`+server.js`), members-only (same guard as the
   geocode proxy — not for view-only share-link holders).
2. **CSP `sandbox allow-scripts allow-popups`** on that response
   (`pageResponseHeaders()` in `$lib/server/pages.js`). The document gets an
   **opaque origin**: `document.cookie` throws, same-origin fetches to tripwala
   are blocked by CORS, storage is walled off. Scripts, inline styles, CDN
   assets still work — the page stays fun.
3. **The viewer iframe repeats `sandbox="allow-scripts allow-popups"`** as an
   independent second layer (PagesSection.svelte). Keep the two lists
   identical; never add `allow-same-origin` to either — that single token is
   the difference between "sandboxed" and "XSS".

Verified empirically (2026-10-12): a test page probing from inside the sandbox
sees cookie unreadable + same-origin fetch blocked, under both the iframe and
direct new-tab opens (the CSP header covers the no-iframe case).

## Plumbing

- Collection `trip_pages` (migration `1718606500_trip_pages.js`): trip,
  added_by, title (≤120), html (≤1.5 MB). Superuser-only rules like every trip
  child collection.
- Ops on `/[share_token]/actions`: `page_add` / `page_update` (title-only
  rename keeps the stored HTML; sending `html` replaces it) / `page_remove`.
  Any member adds; creator or organizer manages — the bookings permission
  pattern. Validation in `validatePage()`.
- Trip payload carries **metadata only** (`shapePages` — id/title/author/date);
  the HTML is fetched by the iframe, never shipped with the trip load.
- UI: `pages` rail module (registry in `tripSections.js` → hideable per trip
  like the rest), `PagesSummary` rail card, `PagesSection` focus module with
  add/edit (paste or pick an `.html` file) and the fullscreen viewer.
