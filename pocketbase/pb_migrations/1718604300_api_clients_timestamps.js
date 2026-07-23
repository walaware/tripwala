/// <reference path="../pb_data/types.d.ts" />

// walaware API Access — add the `created`/`updated` autodate fields to `api_clients`.
//
// The collection was created (1718603600_api_clients.js) with an EXPLICIT `fields`
// array that omitted `created`/`updated`, and PB 0.23+ does NOT auto-inject them
// when fields are declared explicitly. That left the collection with no `created`
// field — so the personal-key surface's `listPersonalKeys` (sort: '-created') hit a
// PocketBase 400 ("nonexistent sort field"), surfacing as a 500 on /settings/api-keys.
//
// Both fields are additive and safe on the existing service tokens / seed record
// (autodate only stamps on create/update events; pre-existing rows simply carry an
// empty value until next saved). `created` is the sort key + the "Created …" line in
// the key list; `updated` mirrors the rest of the schema for parity.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('api_clients');
    collection.fields.add(
      new Field({ name: 'created', type: 'autodate', onCreate: true, onUpdate: false })
    );
    collection.fields.add(
      new Field({ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true })
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('api_clients');
    collection.fields.removeByName('updated');
    collection.fields.removeByName('created');
    app.save(collection);
  }
);
