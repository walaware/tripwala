import { json } from '@sveltejs/kit';
import { authorize } from '$lib/server/apiGuard.js';

// GET /api/x/v1/whoami — identity + granted scopes. No trip data; lets a consumer
// (Claude Code, a script) confirm the key works and see what it can reach. whoami
// needs no scope, but still authenticates + rate-limits + audits like every route.
export async function GET(event) {
  const { pb, auth } = await authorize(event, null);

  /** @type {any} */
  let user = null;
  try {
    const u = await pb.collection('users').getOne(auth.userId);
    user = { id: u.id, email: u.email, name: u.name ?? '' };
  } catch (/** @type {any} */ _e) {
    user = { id: auth.userId };
  }

  return json({
    key: auth.label,
    user,
    scopes: auth.scopes,
    api_version: 'v1'
  });
}
