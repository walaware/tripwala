/// <reference path="../pb_data/types.d.ts" />

// Rename the per-trip album fields to be provider-neutral. Photos are no longer
// Immich-only: a trip can link a shared album from any provider (Google Photos,
// iCloud, Immich, …) by pasting its share link — see web/src/lib/photoProviders.js.
//
//   immich_album_url -> photo_album_url   the album's share link (embed / link-out)
//   immich_album_id  -> photo_album_id    provider album id for Immich-managed
//                                         albums (drives name-sync); empty for
//                                         pasted links
//
// The instance-level Immich CONNECTION settings (app_settings.immich_url /
// immich_api_key) keep their names — those are genuinely Immich-specific, used
// only by the "create an album in Immich" path.
//
// A pure rename: field types and any existing values are preserved.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.getByName('immich_album_url').name = 'photo_album_url';
    trips.fields.getByName('immich_album_id').name = 'photo_album_id';
    app.save(trips);
  },
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.getByName('photo_album_url').name = 'immich_album_url';
    trips.fields.getByName('photo_album_id').name = 'immich_album_id';
    app.save(trips);
  }
);
