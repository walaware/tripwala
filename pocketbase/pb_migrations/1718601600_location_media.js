/// <reference path="../pb_data/types.d.ts" />

// Rich location cards (#location-cards): give each location idea a picture and a
// cached link preview, and let a confirmed trip point at the picked idea so its
// image carries over.
//
// location_ideas gains:
//   - image            a single uploaded/drag-dropped picture (overrides preview)
//   - preview_image    og:image URL we unfurled from the idea's link (string only;
//                      the browser loads the remote image directly, we never proxy it)
//   - preview_title    og:title / <title>
//   - preview_description  og:description
//   - preview_fetched  we've already tried to unfurl the link (don't refetch)
//
// trips gains:
//   - picked_location  relation to the chosen idea, so TripView can show its image
//                      on a confirmed trip. cascadeDelete:false — losing the idea
//                      just clears the pointer, it never deletes the trip.
//
// Empty values everywhere = no media (back-compat with existing ideas). Locked to
// superuser like the rest of planning; written only via the /plan endpoint.

migrate(
  (app) => {
    const ideas = app.findCollectionByNameOrId('location_ideas');
    ideas.fields.add(
      new Field({
        name: 'image',
        type: 'file',
        maxSelect: 1,
        maxSize: 5242880, // 5 MB
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      })
    );
    ideas.fields.add(new Field({ name: 'preview_image', type: 'text', max: 1000 }));
    ideas.fields.add(new Field({ name: 'preview_title', type: 'text', max: 300 }));
    ideas.fields.add(new Field({ name: 'preview_description', type: 'text', max: 600 }));
    ideas.fields.add(new Field({ name: 'preview_fetched', type: 'bool' }));
    app.save(ideas);

    const ideasId = app.findCollectionByNameOrId('location_ideas').id;
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.add(
      new Field({
        name: 'picked_location',
        type: 'relation',
        required: false,
        collectionId: ideasId,
        maxSelect: 1,
        cascadeDelete: false
      })
    );
    app.save(trips);
  },
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.removeByName('picked_location');
    app.save(trips);

    const ideas = app.findCollectionByNameOrId('location_ideas');
    for (const n of ['image', 'preview_image', 'preview_title', 'preview_description', 'preview_fetched']) {
      ideas.fields.removeByName(n);
    }
    app.save(ideas);
  }
);
