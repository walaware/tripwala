/// <reference path="../pb_data/types.d.ts" />

// Navigate-from-the-itinerary (map deep links).
//
// Two additions, both additive and backwards-compatible:
//   1) itinerary_items.place — an optional free-text destination (a place name,
//      address, or "lat,lng") for an entry. When set, the Itinerary section shows
//      a "Navigate" button that deep-links into the viewer's preferred map app.
//      Empty (the default for every existing item) → no button, no change.
//   2) users.map_app — a per-user preference: which map app the navigate links
//      open. 'apple' (default when empty — Apple Maps is preferred) or 'google'.
//      Sits beside temp_unit as the next entry in the small prefs set ($lib/prefs.js).
//
// itinerary_items stays superuser-only (writes go through the /actions endpoint);
// map_app is written from /profile like the other user prefs.

migrate(
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.add(new Field({ name: 'place', type: 'text', required: false, max: 300 }));
    app.save(items);

    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new Field({ name: 'map_app', type: 'select', maxSelect: 1, values: ['apple', 'google'] }));
    app.save(users);
  },
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.removeByName('place');
    app.save(items);

    const users = app.findCollectionByNameOrId('users');
    users.fields.removeByName('map_app');
    app.save(users);
  }
);
