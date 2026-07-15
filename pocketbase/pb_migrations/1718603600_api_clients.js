/// <reference path="../pb_data/types.d.ts" />

// walaware API Access — the token identity model (adopts templates/api-access).
//
// Creates the `api_clients` auth collection. One record = one scoped, revocable
// API token identity. This is NOT a superuser — it can do nothing on its own; the
// curated `/api/x/*` hook routes (pb_hooks/api_x.pb.js) are the only thing that
// reads its `scopes` and acts on its behalf. See docs/for-api.md.
//
// Ordering note (deviation from the kit's "run before the final lock_rules"):
// tripwala's `lock_rules` migration (1718600300) is EARLY and locks a fixed list
// of the MVP collections — it is not the last migration and does not touch new
// collections. Every collection added since (trip_ideas is trips-status, plus
// notifications, friendships, trip_invitations, …) sets its own rules to null at
// creation. This migration does the same (self-contained superuser-only rules),
// so it is safe to append here after the notifications migrations; there is no
// later lock step for it to precede.

migrate(
  (app) => {
    const collection = new Collection({
      type: 'auth',
      name: 'api_clients',

      // No interactive login for these identities. Tokens are minted by the app
      // server (superuser) via the impersonate endpoint — never by password/OAuth.
      passwordAuth: { enabled: false },
      oauth2: { enabled: false },
      otp: { enabled: false },
      mfa: { enabled: false },

      // Default token lifetime for records of this collection (730 days).
      // `impersonate` overrides per-token; this is the auth-refresh ceiling.
      authToken: { duration: 63072000 },

      // Deactivating a client is an INSTANT, cryptographically-independent revoke:
      // PB re-applies authRule on every token verification, so `active = false`
      // rejects every outstanding token for that client immediately.
      authRule: 'active = true',
      manageRule: null,

      // Superuser-only, like every other tripwala collection — the browser never
      // touches PocketBase and only the app server mints/rotates tokens.
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,

      fields: [
        // Human label, e.g. "tripwala-concierge-bot".
        { name: 'name', type: 'text', required: true, max: 100 },
        // Array of scope strings, e.g. ["trips:read", "trip_ideas:write"].
        // The curated routes check requested scope ⊆ this list. Never grant "*".
        { name: 'scopes', type: 'json', required: true },
        // Multi-instance apps set this per-tenant. tripwala is single-instance, so
        // it stays blank — kept for cross-app parity with the standard.
        { name: 'instance', type: 'text', max: 100 },
        // Flip to false to revoke instantly (see authRule above).
        { name: 'active', type: 'bool' },
        // Who holds it, why it was issued, rotation date — the audit trail.
        { name: 'note', type: 'text', max: 500 }
      ],

      indexes: ['CREATE UNIQUE INDEX idx_api_clients_name ON api_clients (name)']
    });

    app.save(collection);

    // Seed one DISABLED example client so the shape + tripwala's scope vocabulary
    // are visible in the admin UI. Mint a real token with scripts/api-token.sh;
    // leave this one inactive.
    const seed = new Record(collection);
    seed.set('name', 'tripwala-example');
    seed.set('scopes', [
      'trips:read',
      'trip_ideas:read',
      'participants:read',
      'invitations:read'
    ]);
    seed.set('instance', '');
    seed.set('active', false);
    seed.set('note', 'Template seed — edit scopes, then mint a token via scripts/api-token.sh.');
    // Auth records need email + a random password even when passwordAuth is off.
    seed.set('email', 'tripwala-example@api.invalid');
    seed.setRandomPassword();
    app.save(seed);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('api_clients');
    app.delete(collection);
  }
);
