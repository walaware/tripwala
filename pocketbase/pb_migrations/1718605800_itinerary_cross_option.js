/// <reference path="../pb_data/types.d.ts" />

// Cross out a decision option (#cross-option). An organizer can mark an option
// under a "To decide" question as ruled-out: it stays visible for reference (so
// the crew can see it was considered) but is struck through, shrunk, and sorted
// to the bottom of that question's options so it clearly isn't a live choice.
//
// itinerary_items gains:
//   - crossed  bool. Empty/false everywhere = a normal, live option (back-compat).
//
// Only ever set on options (undated kind='flexible' rows under a question), via
// the organizer-only itin_item_cross op; itinerary_items stays superuser-only.

migrate(
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.add(new Field({ name: 'crossed', type: 'bool' }));
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.removeByName('crossed');
    app.save(items);
  }
);
