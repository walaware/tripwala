// moneywala integration (its charter step 7): benefit-aware hotel planning.
// tripwala is the first consumer of moneywala's programmatic API — the walaware
// API Access standard: a scoped service token (benefits:read + advisor:read)
// over the curated, versioned /api/x/v1 surface. Consumer contract:
// ~/workspace/walaware/moneywala/docs/for-api.md.
//
// Hard rules from that contract, honored here:
//   - ALL calls are server-side; MONEYWALA_API_TOKEN must never reach the
//     browser (that's why this module lives under $lib/server).
//   - Raw `Authorization: <token>` header — no Bearer prefix (PocketBase
//     service-token convention).
//   - The API is tailnet-only; from outside the tailnet it simply won't
//     resolve. That's fine: the feature is an enhancement, not a dependency —
//     callers must treat any throw here as "benefits check unavailable".
//   - Quotes are manual inputs, never scraped; our token cannot write
//     (reserve/confirm stays in moneywala's own UI).

import { env } from '$env/dynamic/private';

const TIMEOUT_MS = 8000;

/** Whether the moneywala connection is configured (URL + token in env). */
export function moneywalaConfigured() {
  return !!(env.MONEYWALA_API_URL && env.MONEYWALA_API_TOKEN);
}

/**
 * Low-level moneywala API call. Throws an Error with a friendly message on any
 * failure — timeouts, DNS (off-tailnet), or an API-level {status,message}.
 * @param {string} method
 * @param {string} path  e.g. '/benefits'
 * @param {object} [body]
 */
async function api(method, path, body) {
  if (!moneywalaConfigured()) throw new Error('moneywala is not configured');
  const base = String(env.MONEYWALA_API_URL).replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: String(env.MONEYWALA_API_TOKEN),
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = /** @type {any} */ (err)?.name === 'AbortError' ? 'timed out' : 'unreachable';
    throw new Error(`moneywala ${reason}`);
  }
  clearTimeout(timer);
  if (!res.ok) {
    /** @type {any} */
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* non-JSON error body */
    }
    const msg = data?.message ? String(data.message) : `moneywala API ${res.status}`;
    const e = /** @type {Error & { status?: number }} */ (new Error(msg));
    e.status = res.status;
    throw e;
  }
  return await res.json();
}

/**
 * GET /benefits — every tracked benefit instance with card/holder labels.
 * The stay panel dedupes these into its paying-card picker.
 * @returns {Promise<Array<any>>}
 */
export async function listBenefits() {
  const data = await api('GET', '/benefits?limit=200');
  return Array.isArray(data?.items) ? data.items : [];
}

/**
 * GET /channels — the booking-channel values live rules actually gate on.
 * Household data, NOT an enum: consumers must render their picker from this
 * verbatim (matching is exact after trim+lowercase) so it can never drift
 * from moneywala's own advisor screen.
 * @returns {Promise<string[]>}
 */
export async function listChannels() {
  const data = await api('GET', '/channels');
  return Array.isArray(data?.channels) ? data.channels.map(String) : [];
}

/**
 * POST /evaluate-booking — moneywala's deterministic advisor (pure code; AI
 * may explain, never decide). Caller passes an already-validated v1 payload
 * (see parseEvaluateRequest in $lib/benefits.js); moneywala owns the math.
 * @param {Record<string, unknown>} payload
 * @returns {Promise<any>} raw v1 response
 */
export async function evaluateBooking(payload) {
  return await api('POST', '/evaluate-booking', payload);
}
