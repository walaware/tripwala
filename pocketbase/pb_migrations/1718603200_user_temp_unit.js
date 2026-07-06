/// <reference path="../pb_data/types.d.ts" />

// Per-user preference: temperature unit for the trip weather forecast.
// - 'F' (Fahrenheit) / 'C' (Celsius).
// Empty reads as 'F' in app code (the app's original hard-coded unit), so
// existing users are unaffected. This is the first of a small, growing set of
// user preferences (see $lib/prefs.js) — future prefs land as sibling fields.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new Field({ name: 'temp_unit', type: 'select', maxSelect: 1, values: ['F', 'C'] }));
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.removeByName('temp_unit');
    app.save(users);
  }
);
