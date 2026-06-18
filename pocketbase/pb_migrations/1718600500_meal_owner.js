/// <reference path="../pb_data/types.d.ts" />

// Meals get an owner + helpers model. One signup per slot is the OWNER
// (is_owner = true) — they set the dish (what's being made). Everyone else is a
// helper. If the owner drops the meal it resets (all signups for that slot are
// removed), with a warning in the UI. `is_owner` distinguishes the owner row.

migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('meal_signups');
    c.fields.add(new Field({ name: 'is_owner', type: 'bool' }));
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId('meal_signups');
    c.fields.removeByName('is_owner');
    app.save(c);
  }
);
