/// <reference path="../pb_data/types.d.ts" />

// "Someday" trip ideas (#wishlist): a private place to capture whole-trip ideas
// that are still tentative ("road trip to Vancouver Island someday") — no dates,
// just gathering thoughts. Rather than a separate entity, an idea is a trip in a
// new `status='idea'` stage that precedes planning:
//
//   idea → planning → confirmed → completed
//
// This reuses everything a trip already has: membership (so an idea is private to
// you, or you + an invited co-organizer), the planning canvas as the "gather
// thoughts" surface, and a one-field "promote to trip" (idea → planning). The
// only schema change is widening the trips.status enum to include 'idea'.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    const status = trips.fields.getByName('status');
    status.values = ['idea', 'planning', 'confirmed', 'completed'];
    app.save(trips);
  },
  (app) => {
    // Reverting drops 'idea' from the enum; any lingering idea trips are moved to
    // 'planning' first so no row is left with a value the field no longer allows.
    const trips = app.findCollectionByNameOrId('trips');
    try {
      const ideas = app.findRecordsByFilter('trips', "status = 'idea'");
      for (const t of ideas) {
        t.set('status', 'planning');
        app.save(t);
      }
    } catch (_) {
      // best-effort: no idea rows (or query unsupported) — just narrow the enum
    }
    const status = trips.fields.getByName('status');
    status.values = ['planning', 'confirmed', 'completed'];
    app.save(trips);
  }
);
