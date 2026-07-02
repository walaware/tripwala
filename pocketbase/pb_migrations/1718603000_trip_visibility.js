/// <reference path="../pb_data/types.d.ts" />

// Trip calendar visibility (#30, Surface B): opt a trip into being visible to
// your accepted friends' calendars.
//
// - private (default / empty): unchanged — only invited members see the trip at
//   all. This preserves the core principle ("one link, private to the people you
//   invite").
// - friends: accepted friends of any member may see a read-only TEASER of the
//   trip (name, dates, location) on their /calendar — never the private details.
//   The teaser is metadata only; the detail route still gates on membership.
//
// Empty reads as 'private' in app code, so existing trips are unaffected.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.add(
      new Field({ name: 'visibility', type: 'select', maxSelect: 1, values: ['private', 'friends'] })
    );
    app.save(trips);
  },
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.removeByName('visibility');
    app.save(trips);
  }
);
