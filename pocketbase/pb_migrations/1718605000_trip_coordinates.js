/// <reference path="../pb_data/types.d.ts" />

// Canonical trip coordinates (#weather-accuracy). The trip's "Where" was a
// free-text string that the weather + map surfaces re-geocoded loosely at read
// time — so an ambiguous name like "Big Pines" silently resolved to whichever
// match ranked first (a Florida one, not the intended backcountry spot). We now
// let the organizer confirm the exact place via the map's Nominatim picker and
// persist its coordinates on the trip, so weather/map read a fixed point instead
// of re-guessing.
//
// trips gains (all optional — empty everywhere = back-compat; legacy trips with
// no coords fall back to the old geocode-the-name path):
//   - lat         latitude  (-90..90),  0 fields both left blank = "unset"
//   - lng         longitude (-180..180)
//   - place_name  the picker's resolved label (e.g. "Big Pines, Angeles NF, US"),
//                 shown so the organizer can see which place the weather is for
//   - elevation   metres above sea level (backpacking surface; filled lazily)
//
// Locked to superuser like the rest of the trip data; written only via the
// /[share_token]/actions trip_update op.

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.add(new Field({ name: 'lat', type: 'number', min: -90, max: 90 }));
    trips.fields.add(new Field({ name: 'lng', type: 'number', min: -180, max: 180 }));
    trips.fields.add(new Field({ name: 'place_name', type: 'text', max: 300 }));
    trips.fields.add(new Field({ name: 'elevation', type: 'number' }));
    app.save(trips);
  },
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    for (const n of ['lat', 'lng', 'place_name', 'elevation']) {
      trips.fields.removeByName(n);
    }
    app.save(trips);
  }
);
