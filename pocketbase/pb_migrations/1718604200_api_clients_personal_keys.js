/// <reference path="../pb_data/types.d.ts" />

// walaware API Access — personal-key fields on `api_clients` (walaware standard,
// "Personal keys (user self-service)"). tripwala is the FIRST adopter of this mode.
//
// The base `api_clients` collection (1718603600_api_clients.js) is the service-token
// identity model. A "personal key" is a token an END USER mints for their OWN data:
// the app server confines every request to `user` (reads user-filtered, writes
// role-mirrored to their per-trip organizer/guest role). Three added fields — all
// OPTIONAL, so existing service tokens (which leave them null) are unaffected:
//
//   * user          relation → users. SET ⇒ personal key (app-server surface confines
//                   to this user). UNSET ⇒ whole-app service token, exactly as before.
//                   cascadeDelete: deleting a user removes their keys.
//   * last_used     a plain date the SvelteKit surface stamps on each call
//                   (record.set('last_used', new Date()) + save), so a user can spot a
//                   stale/leaked key. NOT autodate — it must not bump on unrelated saves.
//   * token_prefix  first chars of the issued token, stored at mint so the key list can
//                   show WHICH key a row is. The full token is revealed ONCE, at creation.
//
// Ordering: appended after the latest migration (1718604100_bookings.js). tripwala's
// lock_rules migration (1718600300) is early and touches a fixed MVP list only; the
// api_clients collection already carries its own superuser-only rules, so there is no
// later lock step for this to precede.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('api_clients');
    const usersId = app.findCollectionByNameOrId('users').id;

    collection.fields.add(
      new Field({
        name: 'user',
        type: 'relation',
        required: false,
        maxSelect: 1,
        cascadeDelete: true,
        collectionId: usersId
      })
    );
    collection.fields.add(new Field({ name: 'last_used', type: 'date' }));
    collection.fields.add(new Field({ name: 'token_prefix', type: 'text', max: 20 }));

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('api_clients');
    collection.fields.removeByName('token_prefix');
    collection.fields.removeByName('last_used');
    collection.fields.removeByName('user');
    app.save(collection);
  }
);
