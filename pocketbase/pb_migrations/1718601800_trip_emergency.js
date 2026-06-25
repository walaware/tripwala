/// <reference path="../pb_data/types.d.ts" />

// Emergency info card (#4): a trip-level free-text field for the stuff you want
// at hand in the backcountry — nearest hospital, ranger/park station, emergency
// contacts. Organizer-edited (via trip_update), shown to everyone as a distinct
// "Safety" card when set. Empty = no card (back-compat). Superuser-locked.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.add(new Field({ name: 'emergency_info', type: 'text', max: 2000 }));
    app.save(trips);
  },
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.removeByName('emergency_info');
    app.save(trips);
  }
);
