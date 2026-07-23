/// <reference path="../pb_data/types.d.ts" />

// Rich itinerary decisions (#to-decide-cards): give an itinerary item — most
// usefully an undated "To decide" suggestion like "where do we eat tonight" or
// "where do we camp this weekend" — the same rich surface a planning-phase
// location idea has: a photo, a link, and a cached link preview. This closes the
// gap where the confirmed-trip "To decide" list had only a note + free-text place
// (map deep link) but none of the photo/link richness of planning's location cards.
//
// itinerary_items gains (all optional — empty everywhere = back-compat with
// existing items, exactly like location_media did for location_ideas):
//   - url                  an optional link (validated http(s) at the /actions endpoint)
//   - image                a single uploaded/drag-dropped picture (overrides preview);
//                          thumbed at 416x224 for the compact row thumbnail
//   - preview_image        og:image URL we unfurled from the link (string only; the
//                          browser loads the remote image directly, we never proxy it)
//   - preview_title        og:title / <title>
//   - preview_description  og:description
//   - preview_fetched      we've already tried to unfurl the link (don't refetch)
//
// Locked to superuser like the rest of the trip data; written only via the
// /[share_token]/actions endpoint.

migrate(
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.add(new Field({ name: 'url', type: 'text', max: 500 }));
    items.fields.add(
      new Field({
        name: 'image',
        type: 'file',
        maxSelect: 1,
        maxSize: 5242880, // 5 MB
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      })
    );
    items.fields.add(new Field({ name: 'preview_image', type: 'text', max: 1000 }));
    items.fields.add(new Field({ name: 'preview_title', type: 'text', max: 300 }));
    items.fields.add(new Field({ name: 'preview_description', type: 'text', max: 600 }));
    items.fields.add(new Field({ name: 'preview_fetched', type: 'bool' }));
    // Right-sized thumb for the compact row (208x112 @2x, center-cropped); PB
    // returns the original for any unlisted size, so this stays back-compat.
    items.fields.getByName('image').thumbs = ['416x224'];
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    for (const n of ['url', 'image', 'preview_image', 'preview_title', 'preview_description', 'preview_fetched']) {
      items.fields.removeByName(n);
    }
    app.save(items);
  }
);
