/// <reference path="../pb_data/types.d.ts" />

// Pick the final answer for a decision (#pick-answer). Once the crew has
// weighed in, an organizer can settle a "To decide" question by picking one of
// its options as THE answer. That deprecates the question: it stops counting as
// an open decision and moves to a compact "Decided" strip that just shows the
// chosen answer. Reopening (clearing the pick) puts it back in play.
//
// itinerary_items gains:
//   - picked  relation → itinerary_items (self, maxSelect 1). Set ONLY on a
//     question row, pointing at one of its own options. cascadeDelete:false so
//     deleting the answer option doesn't delete the question — PocketBase clears
//     the dangling reference automatically, so the question just reopens.
//
// Empty everywhere = an open, undecided question (back-compat). Set only via the
// organizer-only itin_question_resolve op; itinerary_items stays superuser-only.

migrate(
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.add(
      new Field({
        name: 'picked',
        type: 'relation',
        required: false,
        collectionId: items.id,
        maxSelect: 1,
        cascadeDelete: false
      })
    );
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');
    items.fields.removeByName('picked');
    app.save(items);
  }
);
