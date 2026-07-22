import { fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import {
  mintPersonalKey,
  listPersonalKeys,
  revokePersonalKey,
  PERSONAL_KEY_SCOPES
} from '$lib/server/apiKeys.js';

// Self-service personal API keys. The user is already authenticated to the app
// server by their session; minting never exposes a superuser token and the full
// key is shown exactly ONCE (the action returns it; the page reveals + forgets it).

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
  if (!locals.user) throw redirect(303, '/login?next=/settings/api-keys');
  const pb = await superuserPb();
  return {
    keys: await listPersonalKeys(pb, locals.user.id),
    scopes: PERSONAL_KEY_SCOPES,
    // Public origin for the copy-paste snippets (behind Caddy/Cloudflare this is
    // the public host); the personal-key surface lives at /api/x/v1.
    apiBase: `${url.origin}/api/x/v1`
  };
}

/** @type {import('./$types').Actions} */
export const actions = {
  // Create a key → return the full token ONCE for the page to reveal.
  create: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/settings/api-keys');
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Give the key a name.' });
    if (name.length > 60) return fail(400, { error: 'Keep the name under 60 characters.' });

    const pb = await superuserPb();
    try {
      const created = await mintPersonalKey(pb, { id: locals.user.id }, name);
      // `token` is returned exactly once here — never persisted or recoverable.
      return { created: { id: created.id, token: created.token, prefix: created.prefix, label: created.label } };
    } catch (/** @type {any} */ err) {
      const message = err?.status ? err.body?.message || err.message : 'Could not create the key — please try again.';
      return fail(err?.status && err.status < 500 ? err.status : 502, { error: message });
    }
  },

  // Revoke a key (active=false + tokenKey reset) — instant and permanent.
  revoke: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/settings/api-keys');
    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    if (!id) return fail(400, { error: 'Missing key id.' });

    const pb = await superuserPb();
    try {
      await revokePersonalKey(pb, locals.user.id, id);
      return { revoked: id };
    } catch (/** @type {any} */ err) {
      const message = err?.status ? err.body?.message || err.message : 'Could not revoke the key.';
      return fail(err?.status && err.status < 500 ? err.status : 502, { error: message });
    }
  }
};
