/// <reference path="../pb_data/types.d.ts" />

// Fix: Google sign-in failed with 403 "Only superusers can perform this action."
//
// On first OAuth2 login PocketBase *creates* the user record, and that create is
// governed by the users collection's createRule. The auth migration locked it to
// superuser-only, which blocked OAuth sign-up. Allow creation here — safe in this
// deployment because PocketBase is internal-only (never publicly reachable; only
// the SvelteKit server talks to it). Email/password signup still goes through the
// superuser client and is unaffected.

migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('users');
    c.createRule = '';
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId('users');
    c.createRule = null;
    app.save(c);
  }
);
