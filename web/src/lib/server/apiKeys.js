// Personal API keys — self-service tokens an end user mints for THEIR OWN data
// (walaware API Access, "Personal keys (user self-service)"). tripwala is the
// first adopter. A personal key is an `api_clients` record with `user` set; the
// SvelteKit surface (/api/x/v1/*) confines every request to that user, so the key
// is a headless session as its owner and never a new capability.
//
// Minting mirrors scripts/api-token.sh but runs in-process: the app server (already
// the superuser via superuserPb()) creates the record and calls PocketBase's
// `impersonate` endpoint for a long-lived token. No password is ever shared; the
// full token is returned exactly ONCE (the caller reveals it, then it's gone).

import { error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

/**
 * The default personal-key grant: "all scopes, user-confined". This is NOT a `*`
 * / superuser grant — the per-user read filtering and per-role write checks in the
 * API routes do the actual narrowing (a guest's key still gets a 403 on an
 * organizer-only write). Kept in lockstep with the API surface + docs/for-api.md.
 * @type {string[]}
 */
export const PERSONAL_KEY_SCOPES = [
  'trips:read',
  'trip_ideas:read',
  'participants:read',
  'invitations:read',
  'trip_ideas:write',
  'trips:write'
];

// Long-lived token lifetime (365 days). The api_clients collection's authToken
// duration (730d) is the ceiling; impersonate sets this per-token.
const TOKEN_DURATION = 31_536_000;

const MAX_LABEL = 60;

/**
 * A never-used random password (personal keys have no interactive login).
 * PocketBase's password field caps at 70 chars ("must be less than 71"), so two
 * raw UUIDs (72 chars) overflow it and 400 the create — cap the concatenation at
 * 70. A full UUID plus 34 more chars is ample entropy for a secret never revealed.
 */
const randomSecret = () => (randomUUID() + randomUUID()).slice(0, 70);

/**
 * A short, non-secret fingerprint of a token for the key list ("which key is
 * this?"). PocketBase issues JWTs, so a bare leading prefix is identical across
 * ALL keys (`eyJhbGciOiJ…`) — useless for telling them apart. A head+tail slice
 * distinguishes keys; the 4 trailing signature chars reveal nothing exploitable.
 * @param {string} token
 */
function tokenFingerprint(token) {
  if (token.length <= 14) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

/**
 * Mint a personal key for a signed-in user. Creates the `api_clients` record
 * (bound to the user, all scopes, active) and returns the full token ONCE.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ id: string }} user the signed-in user
 * @param {string} label human name for the key, shown in their key list
 * @returns {Promise<{ id: string, token: string, prefix: string, label: string }>}
 */
export async function mintPersonalKey(pb, user, label) {
  const name = String(label ?? '').trim();
  if (!name) throw error(400, 'Give the key a name');
  if (name.length > MAX_LABEL) throw error(400, `Keep the name under ${MAX_LABEL} characters`);

  // `api_clients.name` is globally unique; personal keys use an internal, owner-
  // scoped name (greppable in audit logs) and keep the human label in `note`.
  const internalName = `pk_${user.id}_${randomUUID().slice(0, 8)}`;
  const pw = randomSecret();

  const record = await pb.collection('api_clients').create({
    name: internalName,
    note: name,
    scopes: PERSONAL_KEY_SCOPES,
    user: user.id,
    active: true,
    instance: '',
    email: `${internalName}@pk.invalid`,
    password: pw,
    passwordConfirm: pw
  });

  // Long-lived token via impersonate (superuser) — never a password to the user.
  // Any failure past record creation rolls the record back, so a mint error can't
  // leave an orphaned, un-revealed key sitting in the user's list.
  try {
    const impersonated = await pb.collection('api_clients').impersonate(record.id, TOKEN_DURATION);
    const token = impersonated.authStore.token;
    if (!token) throw new Error('no token returned');

    const prefix = tokenFingerprint(token);
    await pb.collection('api_clients').update(record.id, { token_prefix: prefix });
    return { id: record.id, token, prefix, label: name };
  } catch (/** @type {any} */ _e) {
    await pb.collection('api_clients').delete(record.id).catch(() => {});
    throw error(502, 'Could not mint the key — please try again');
  }
}

/**
 * A user's personal keys — METADATA ONLY (the token is never recoverable).
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @returns {Promise<Array<{ id: string, label: string, prefix: string, created: string, last_used: string, active: boolean }>>}
 */
export async function listPersonalKeys(pb, userId) {
  if (!userId) return [];
  const rows = await pb
    .collection('api_clients')
    .getFullList({ filter: pb.filter('user = {:u}', { u: userId }), sort: '-created' });
  return rows.map((r) => ({
    id: r.id,
    label: r.note || r.name,
    prefix: r.token_prefix || '',
    created: String(r.created ?? ''),
    last_used: String(r.last_used ?? ''),
    active: r.active === true
  }));
}

/**
 * Revoke a user's key: `active = false` AND a password reset (regenerates the
 * record's tokenKey, cryptographically voiding every issued token). Both together
 * make revoke instant and permanent (see the standard, §1). Ownership-checked.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId the owner making the request
 * @param {string} keyId
 */
export async function revokePersonalKey(pb, userId, keyId) {
  let rec;
  try {
    rec = await pb.collection('api_clients').getOne(keyId);
  } catch (/** @type {any} */ _e) {
    throw error(404, 'Key not found');
  }
  // A user may only revoke their OWN keys, never a service token or someone else's.
  if (!rec.user || rec.user !== userId) throw error(403, 'That key is not yours');
  const pw = randomSecret();
  await pb.collection('api_clients').update(keyId, { active: false, password: pw, passwordConfirm: pw });
}

/**
 * Validate an incoming bearer token as a personal key. Loads its `api_clients`
 * record via `authRefresh` — which fails closed on a reset tokenKey (rotate/revoke)
 * AND on the collection authRule (`active = true`, so a deactivated key is rejected
 * instantly). We additionally assert `active` and that `user` is set (a service
 * token, with no `user`, is NOT valid on this user-confined surface).
 *
 * @param {string | null | undefined} authorizationHeader raw `Authorization` header
 * @returns {Promise<null | { keyId: string, userId: string, scopes: string[], label: string, prefix: string }>}
 */
export async function authenticatePersonalKey(authorizationHeader) {
  const token = extractBearer(authorizationHeader);
  if (!token) return null;

  // A PocketBase token is a JWT — three dot-separated segments. Reject anything
  // else WITHOUT a PocketBase round-trip, so garbage bearer values on the public
  // edge can't amplify into an authRefresh call each (cheap DoS backstop).
  if (token.split('.').length !== 3) return null;

  // Lazy import so this module has no static $env dependency (keeps the pure
  // helpers unit-testable under plain `node --test`).
  const { newClient } = await import('./pocketbase.js');
  const client = newClient();
  client.authStore.save(token, null);

  /** @type {any} */
  let record;
  try {
    const res = await client.collection('api_clients').authRefresh();
    record = res?.record;
  } catch (/** @type {any} */ _e) {
    return null; // bad signature, reset tokenKey, or authRule (active=false) failed
  }

  if (!record || record.active !== true) return null;
  const userId = record.user;
  if (!userId) return null; // service token — not permitted on the personal surface

  const scopes = Array.isArray(record.scopes) ? record.scopes : [];
  return {
    keyId: record.id,
    userId: String(userId),
    scopes,
    label: record.note || record.name || '',
    prefix: record.token_prefix || ''
  };
}

/**
 * Stamp `last_used` on a key so its owner can spot a stale/leaked one. Best-effort:
 * a failure here must never fail the API call it accompanies.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} keyId
 */
export async function stampLastUsed(pb, keyId) {
  try {
    await pb.collection('api_clients').update(keyId, { last_used: new Date().toISOString() });
  } catch (/** @type {any} */ _e) {
    /* non-fatal */
  }
}

/**
 * Pull the token out of an `Authorization: Bearer <token>` header. Tolerates a
 * bare token too. Returns '' when absent/malformed.
 *
 * @param {string | null | undefined} header
 * @returns {string}
 */
export function extractBearer(header) {
  const raw = String(header ?? '').trim();
  if (!raw) return '';
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  if (m) return m[1].trim();
  // A lone "Bearer" keyword carries no token — reject it (don't treat it as one).
  if (/^Bearer$/i.test(raw)) return '';
  return raw; // tolerate a bare token (no Bearer prefix)
}
