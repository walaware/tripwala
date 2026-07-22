/// <reference path="../pb_data/types.d.ts" />

// The gear/packing consolidation, schema half. Non-destructive — no rows are
// created or deleted, and no values are dropped.
//
// Background: `packing_items` carried two different things behind one flag.
// `is_shared = true` (participant = null) was never really "a shared checklist" —
// it was the organizer recommending things people should pack. That intent had
// no name in the schema, so it read as a weaker duplicate of gear_items. Naming
// it fixes that:
//
//   is_shared  ->  recommended    organizer-authored suggestions
//   (unchanged)    participant    someone's own pack
//
// One new field:
//   • `from_recommendation` — set when you adopt a suggestion, so it stops being
//                             offered to you. Mirrors `from_gear`, which already
//                             does this for claimed gear.
//
// Note there is deliberately NO `visible` flag. Making a personal item visible to
// the crew means it becomes an item on the public list that you own — which is
// exactly what `from_gear` already records (claiming public gear auto-adds the
// linked personal row). The eye toggle runs that same bridge in the other
// direction, so `from_gear != ''` already means "this one is public".
//
// EXPAND ONLY. This migration adds `recommended` and copies `is_shared` into it,
// but deliberately does NOT drop `is_shared`. The old column is left in place,
// unread and unwritten by the app, so this deploy is reversible by rolling the
// code back alone — no data has moved anywhere it can't come back from.
//
// Dropping `is_shared` is a separate, later migration, to be written only once
// this one has been verified against real data. That's the expand/contract
// pattern, and it matters here because pb_migrations apply automatically on
// `serve`: deploying IS migrating, so a single-shot add→copy→drop would remove
// the source column during the same restart that first executes the copy.
//
// The copy is also verified: if the number of migrated rows doesn't match the
// number of source rows, this throws. PocketBase then refuses to start rather
// than leaving the collection half-converted — a loud failure instead of a
// silent one.

migrate(
  (app) => {
    const packing = app.findCollectionByNameOrId('packing_items');

    // 1. Add the new fields alongside the old flag.
    if (!packing.fields.getByName('recommended')) {
      packing.fields.add(new Field({ name: 'recommended', type: 'bool' }));
    }
    if (!packing.fields.getByName('from_recommendation')) {
      packing.fields.add(
        new Field({
          name: 'from_recommendation',
          type: 'relation',
          required: false,
          collectionId: packing.id, // self-relation: your adopted copy -> the suggestion
          maxSelect: 1,
          // Once you've adopted a suggestion the item is YOURS. An organizer
          // withdrawing the suggestion must not reach into everyone's pack and
          // delete it.
          cascadeDelete: false
        })
      );
    }
    app.save(packing);

    // 2. Copy is_shared -> recommended, row by row, so nothing rests on rename
    //    semantics. Only touches rows that were shared.
    if (packing.fields.getByName('is_shared')) {
      const rows = app.findRecordsByFilter('packing_items', 'is_shared = true');
      for (const row of rows) {
        row.set('recommended', true);
        app.save(row);
      }

      // 3. Prove the copy landed before anyone relies on it. If the filter or
      //    the save silently did nothing, these won't match and the migration
      //    aborts — PocketBase won't start, which is the outcome we want over a
      //    half-converted collection nobody notices.
      const migrated = app.findRecordsByFilter('packing_items', 'recommended = true');
      if (migrated.length !== rows.length) {
        throw new Error(
          `packing_items: expected ${rows.length} recommendations after copy, found ${migrated.length}`
        );
      }
    }

    // NOTE: `is_shared` is intentionally still here. Drop it in a follow-up
    // migration once this has been verified against real data.
  },
  (app) => {
    // `is_shared` was never dropped, so rolling back just removes the new
    // columns — the original flag is still sitting there with its values intact.
    const packing = app.findCollectionByNameOrId('packing_items');
    packing.fields.removeByName('recommended');
    packing.fields.removeByName('from_recommendation');
    app.save(packing);
  }
);
