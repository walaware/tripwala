// Personal-key API guard — the gate every /api/x/v1/* route passes through.
//
// The public edge (Caddy) proxies /api/x/* straight to this SvelteKit app with the
// bearer token as the SOLE gate (no tailnet layer), so the controls the standard
// makes MANDATORY for personal keys all live here:
//   1. authenticate the bearer as a personal key      (→ resolves the owning user)
//   2. require the route's scope be granted            (403 on a probe past the grant)
//   3. per-key rate limit                              (a leaked key is internet-reachable)
//   4. stamp last_used + audit the call                (owner can spot a stale key; ops trail)
//
// A route handler receives the resolved `{ pb, auth }` and does its own per-user
// read filtering / per-role write checks (via $lib/server/tripAuthz.js).

import { error, json } from '@sveltejs/kit';
import { superuserPb } from './pocketbase.js';
import { authenticatePersonalKey, stampLastUsed } from './apiKeys.js';
import { rateLimit } from './rateLimit.js';

// Per-key ceiling on the public surface. Generous for a personal automation, but
// a bound on a leaked key. Keyed by key id, so one user's keys don't share a bucket.
const RATE = { limit: 120, windowMs: 60_000 };

/**
 * One structured audit line per served call (client, user, scope, method, path) —
 * to stdout, which adapter-node writes to the container log. `denied` marks a
 * scope refusal (a probing signal), mirroring the PB-hook surface's `warn`.
 *
 * @param {{ keyId: string, userId: string }} auth
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string} scope
 * @param {boolean} [denied]
 */
function audit(auth, event, scope, denied = false) {
  const line = JSON.stringify({
    evt: denied ? 'api.x scope denied' : 'api.x access',
    key: auth.keyId,
    user: auth.userId,
    scope,
    method: event.request.method,
    path: event.url.pathname
  });
  if (denied) console.warn(line);
  else console.info(line);
}

/**
 * Authenticate + authorize a personal-key request for `scope`. Throws the right
 * HTTP error (401/403/429) on any failure; on success returns the superuser pb
 * client and the resolved key/user. Stamps last_used and audits as a side effect.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string | null} scope the scope this route requires (e.g. 'trips:read'),
 *        or null for a scope-free route (still authenticated, rate-limited, audited)
 * @returns {Promise<{ pb: import('pocketbase').default, auth: { keyId: string, userId: string, scopes: string[], label: string, prefix: string } }>}
 */
export async function authorize(event, scope) {
  const auth = await authenticatePersonalKey(event.request.headers.get('authorization'));
  if (!auth) {
    throw error(401, 'Invalid or expired API key');
  }

  // Per-key rate limit BEFORE any data work (cheap first line against a leaked key).
  const { ok, retryAfter } = rateLimit(`pk:${auth.keyId}`, RATE);
  if (!ok) {
    throw error(429, `Rate limit exceeded — retry in ${retryAfter}s`);
  }

  if (scope && !auth.scopes.includes(scope)) {
    audit(auth, event, scope, true);
    throw error(403, `scope '${scope}' not granted`);
  }

  const pb = await superuserPb();
  await stampLastUsed(pb, auth.keyId);
  audit(auth, event, scope || 'whoami');
  return { pb, auth };
}

/**
 * A consistent JSON list envelope, matching the PB-hook service surface so a
 * consumer sees ONE contract across both surfaces.
 *
 * @param {any[]} items
 */
export function listResponse(items) {
  return json({ items, count: items.length });
}
