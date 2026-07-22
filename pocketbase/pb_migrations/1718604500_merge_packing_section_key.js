/// <reference path="../pb_data/types.d.ts" />

// Section-key half of the gear/packing merge. The two modules became one,
// keyed 'gear' — so every trip's `hidden_sections` needs reconciling.
//
// The rule is "hide only if BOTH halves were hidden". Hiding one of two
// overlapping sections was usually a way of saying "this duplicate is noise",
// not "I don't want to track anything to bring" — so the merged section stays
// visible unless the crew had clearly turned the whole idea off.
//
//   hid neither          -> visible   (unchanged)
//   hid 'packing' only   -> visible   ('packing' key dropped)
//   hid 'gear' only      -> visible   ('gear' un-hidden — they still had a
//                                      packing list, and it lives here now)
//   hid both             -> hidden    ('gear' kept, 'packing' dropped)
//
// The now-dead 'packing' key is removed from every trip either way, so it can't
// resurface if a section with that key is ever added again.
//
// Idempotent: re-running is a no-op once 'packing' is gone from every row.

migrate(
  (app) => {
    const trips = app.findRecordsByFilter('trips', 'id != ""');

    for (const trip of trips) {
      // A `json` field comes back from the JSVM as a BYTE array — Array.isArray()
      // is true, but the elements are character codes, so `.includes('packing')`
      // is always false. String() renders the underlying JSON text, which is what
      // we actually want to parse. (Found the hard way: without this the whole
      // migration ran, recorded itself as applied, and changed nothing.)
      let hidden;
      try {
        hidden = JSON.parse(String(trip.get('hidden_sections') || '[]'));
      } catch (_) {
        continue; // unparseable — leave it alone rather than guess
      }
      if (!Array.isArray(hidden) || hidden.length === 0) continue;

      const hidPacking = hidden.includes('packing');
      const hidGear = hidden.includes('gear');
      if (!hidPacking && !hidGear) continue;

      // Drop both keys, then re-add 'gear' only if the whole idea was off.
      const next = hidden.filter((k) => k !== 'packing' && k !== 'gear');
      if (hidPacking && hidGear) next.push('gear');

      trip.set('hidden_sections', next);
      app.save(trip);
    }
  },
  (app) => {
    // Can't reconstruct which of the two a trip had hidden — the distinction was
    // collapsed on the way in. Leaving the merged state alone is safer than
    // guessing and hiding a section someone was using.
  }
);
