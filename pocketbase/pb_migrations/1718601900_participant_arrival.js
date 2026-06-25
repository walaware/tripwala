/// <reference path="../pb_data/types.d.ts" />

// Check-in / arrival status (#11): a lightweight live "where are you" per
// participant so the group can see who's still home, en route, or arrived.
// Empty = not checked in (back-compat). Each member sets their own (organizers
// can set others) via the /actions endpoint. Superuser-locked.

migrate(
  (app) => {
    const participants = app.findCollectionByNameOrId('participants');
    participants.fields.add(
      new Field({ name: 'arrival', type: 'select', maxSelect: 1, values: ['not_left', 'en_route', 'arrived'] })
    );
    app.save(participants);
  },
  (app) => {
    const participants = app.findCollectionByNameOrId('participants');
    participants.fields.removeByName('arrival');
    app.save(participants);
  }
);
