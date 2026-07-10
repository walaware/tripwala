/// <reference path="../pb_data/types.d.ts" />

// A third calendar-visibility tier: 'busy'.
//
//   private  (default / empty)  only invited members see the trip at all.
//   busy                        accepted friends see an anonymous date band on
//                               their /calendar — dates and who is away, never
//                               the trip name or location.
//   friends                     accepted friends see the full teaser
//                               (name + dates + location), as before.
//
// 'busy' is what makes calendar sharing safe to say yes to: it answers "are you
// free that week?" without disclosing where anyone is going. It is also the tier
// trip planning reads when overlaying friends' conflicts on the date picker.
//
// The select's values are widened IN PLACE rather than dropped and re-added, so
// existing 'private'/'friends' rows keep their value. Empty still reads as
// 'private' in app code, so trips created before this migration are unaffected.
//
// users.default_trip_visibility is the per-user default the New-trip form
// prefills (see $lib/prefs.js). Empty reads as 'friends' — note the deliberate
// asymmetry: an EXISTING trip with no visibility is private, but a NEW trip
// defaults to friend-visible unless the creator says otherwise.

const TIERS = ['private', 'busy', 'friends'];

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    const visibility = trips.fields.getByName('visibility');
    if (!visibility) throw new Error('trips.visibility is missing — run 1718603000 first');
    visibility.values = TIERS;
    app.save(trips);

    const users = app.findCollectionByNameOrId('users');
    users.fields.add(
      new Field({ name: 'default_trip_visibility', type: 'select', maxSelect: 1, values: TIERS })
    );
    app.save(users);
  },
  (app) => {
    // Down: collapse 'busy' back to 'private' (the conservative direction — it
    // un-shares rather than over-shares) before narrowing the select again.
    const trips = app.findCollectionByNameOrId('trips');
    app.db().newQuery("UPDATE trips SET visibility = 'private' WHERE visibility = 'busy'").execute();
    const visibility = trips.fields.getByName('visibility');
    if (visibility) {
      visibility.values = ['private', 'friends'];
      app.save(trips);
    }

    const users = app.findCollectionByNameOrId('users');
    users.fields.removeByName('default_trip_visibility');
    app.save(users);
  }
);
