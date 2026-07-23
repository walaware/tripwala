/// <reference path="../pb_data/types.d.ts" />

// Trip route (#backpacking-planner Phase 3). A trip can carry one route: an
// imported GPX/GPS track (rendered on the map with an elevation profile + stats)
// and/or a link to the trail on AllTrails/Gaia/CalTopo/etc. Stored as a single
// json blob so the shape can evolve without a migration per field:
//
//   route = {
//     name,            // trail/track name
//     url,             // optional link-out to the trail page
//     preview,         // optional unfurled { title, image, description } for the link
//     coordinates,     // GeoJSON LineString coords [[lng,lat,ele?], …] (capped 2000 pts)
//     stats            // { distanceM, gainM, lossM, minEle, maxEle, hasEle, count }
//   }
//
// Geometry stats are always re-derived server-side from `coordinates` (see
// $lib/gpx.js), never trusted from the client. Empty everywhere = no route.
// Locked to superuser like the rest of the trip; written only via the
// /[share_token]/actions route_set / route_link / route_clear ops.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    // ~200 KB: comfortably fits a 2000-point 3D LineString + stats + preview.
    trips.fields.add(new Field({ name: 'route', type: 'json', maxSize: 200000 }));
    app.save(trips);
  },
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.removeByName('route');
    app.save(trips);
  }
);
