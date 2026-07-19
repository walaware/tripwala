/// <reference path="../pb_data/types.d.ts" />

// Split the invite capability out of the share slug (#2). Until now the
// `share_token` in a trip's URL both showed the trip AND let anyone signed in
// join it, so you couldn't share a read-only link. Now each trip carries a
// separate random `invite_token`: the bare `/{share_token}` is a view-only
// teaser, and only the invite link (`/{share_token}?invite={invite_token}`) —
// or a direct invitation — grants the join screen.
//
// Existing trips are backfilled with a fresh random invite_token so their
// organizers keep a working invite link (surfaced in trip Settings → Links).

migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.fields.add(
      new Field({ name: 'invite_token', type: 'text', max: 64, pattern: '^[A-Za-z0-9_-]*$' })
    );
    app.save(trips);

    // Backfill: mint a token for every existing trip. Alphabet matches the field
    // pattern and the app-side generateInviteToken (tokens.js) charset.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const rows = app.findRecordsByFilter('trips', '1=1');
    for (const t of rows) {
      if (t.getString('invite_token')) continue;
      t.set('invite_token', $security.randomStringWithAlphabet(24, alphabet));
      app.save(t);
    }

    // Unique per trip (partial, so empty tokens don't collide) — matches the
    // raw-SQL index style used elsewhere in these migrations.
    trips.indexes = [
      ...trips.indexes,
      "CREATE UNIQUE INDEX idx_trips_invite_token ON trips (invite_token) WHERE invite_token != ''"
    ];
    app.save(trips);
  },
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    trips.indexes = trips.indexes.filter((i) => !i.includes('idx_trips_invite_token'));
    trips.fields.removeByName('invite_token');
    app.save(trips);
  }
);
