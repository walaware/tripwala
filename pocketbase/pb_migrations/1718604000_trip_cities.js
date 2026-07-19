/// <reference path="../pb_data/types.d.ts" />

// Multiple cities per trip, as dated segments (#3). A trip's single `location`
// text is the headline; `trip_cities` lets a multi-stop trip carry an ordered
// list of cities, each with its own date range (e.g. Tokyo Jun 1–4, Kyoto
// Jun 4–7). Itinerary days group under whichever city's range contains them —
// the association is derived from dates, so items need no city field.
//
// Superuser-only rules (like every other trip child collection): the browser
// never writes directly; it POSTs ops to /[share_token]/actions, which checks
// membership and trip ownership first.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');

    const cities = new Collection({
      type: 'base',
      name: 'trip_cities',
      fields: [
        {
          name: 'trip',
          type: 'relation',
          required: true,
          maxSelect: 1,
          collectionId: trips.id,
          cascadeDelete: true
        },
        { name: 'name', type: 'text', required: true, max: 120 },
        { name: 'start_date', type: 'date' },
        { name: 'end_date', type: 'date' },
        // Ordering fallback for cities without dates (or same-day). Insertion order.
        { name: 'sort_order', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
      ],
      indexes: ['CREATE INDEX idx_trip_cities_trip ON trip_cities (trip)'],
      // Locked to superuser; app writes go through the actions endpoint.
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null
    });
    app.save(cities);
  },
  (app) => {
    const cities = app.findCollectionByNameOrId('trip_cities');
    app.delete(cities);
  }
);
