/// <reference path="../pb_data/types.d.ts" />

// Group decisions under a question ("Where to camp?") with options beneath it.
//
// The "To decide" bucket used to be a flat list of undated `flexible`
// itinerary_items, each upvoted on its own. This introduces a lightweight
// grouping so a decision is a QUESTION with OPTIONS the crew adds and upvotes:
//   - a question = an undated itinerary_items row with kind='question'; its label
//     is the prompt. Not votable, holds no place/photo — just the title.
//   - an option  = an undated kind='flexible' row whose `group` points at its
//     question. Reuses every option affordance (place/Navigate, photo, link
//     preview, one-vote-per-person upvote).
//
// Two additive schema changes + a data backfill that wraps any pre-existing
// ungrouped decisions into a default "To decide" question per trip, so nothing
// is orphaned once the UI requires every option to live under a question.
// itinerary_items stays superuser-only (writes go through /actions).

migrate(
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');

    // 1) kind gains 'question' (the group header). fixed/flexible unchanged.
    const kind = items.fields.getByName('kind');
    kind.values = ['fixed', 'flexible', 'question'];

    // 2) A self-relation: an option points at its question. Deleting a question
    //    cascades to its options (whose own votes cascade in turn).
    items.fields.add(
      new Field({
        name: 'group',
        type: 'relation',
        required: false,
        collectionId: items.id,
        maxSelect: 1,
        cascadeDelete: true
      })
    );
    app.save(items);

    // 3) Backfill: every trip with ungrouped undated flexible decisions gets one
    //    "To decide" question, and those decisions become its options.
    const orphans = app.findRecordsByFilter(
      'itinerary_items',
      "date = '' && kind = 'flexible' && group = ''"
    );
    /** @type {Record<string, string>} tripId → question id */
    const questionByTrip = {};
    for (const it of orphans) {
      const tripId = it.getString('trip');
      if (!tripId) continue;
      if (!questionByTrip[tripId]) {
        const q = new Record(items);
        q.set('trip', tripId);
        q.set('date', '');
        q.set('label', 'To decide');
        q.set('kind', 'question');
        q.set('sort_order', 0);
        q.set('created_by', it.getString('created_by'));
        app.save(q);
        questionByTrip[tripId] = q.id;
      }
      it.set('group', questionByTrip[tripId]);
      app.save(it);
    }
  },
  (app) => {
    const items = app.findCollectionByNameOrId('itinerary_items');

    // Detach options first so deleting the question rows doesn't cascade-delete
    // the (pre-existing) decisions along with them.
    const grouped = app.findRecordsByFilter('itinerary_items', "group != ''");
    for (const o of grouped) {
      o.set('group', '');
      app.save(o);
    }
    const questions = app.findRecordsByFilter('itinerary_items', "kind = 'question'");
    for (const q of questions) app.delete(q);

    items.fields.removeByName('group');
    const kind = items.fields.getByName('kind');
    kind.values = ['fixed', 'flexible'];
    app.save(items);
  }
);
