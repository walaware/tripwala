/// <reference path="../pb_data/types.d.ts" />

// Itinerary entries get an optional `note` — a longer, wrapping detail line shown
// beneath the short label (the label stays a one-line title; the note carries the
// "why / how" prose). Additive and backwards-compatible: empty (every existing
// item) renders no second line. itinerary_items stays superuser-only (writes go
// through the /actions endpoint).

migrate(
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.add(new Field({ name: 'note', type: 'text', required: false, max: 600 }));
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.removeByName('note');
    app.save(items);
  }
);
