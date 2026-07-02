/// <reference path="../pb_data/types.d.ts" />

// User-targeted trip invitations (#30, Surface A): invite a friend to a trip by
// picking them from your friends list. Unlike `invites` (which is EMAIL-keyed and
// silently consumed when a matching account joins), this targets a known user id
// NOW and shows up on their dashboard as an actionable Accept / Decline card.
//
// The two collections are deliberately separate: `invites` answers "elevate an
// account that appears later, by email"; `trip_invitations` answers "this person
// already has an account — ask them to join." Keeping them apart means every
// relation column here is always filled, so the unique (trip, user) index is safe
// (no empty-relation collision).
//
// status: pending | accepted | declined. On accept the server runs the existing
// joinTrip() path (so orphan-adoption / role / approval all behave consistently)
// and marks the row accepted. CRUD superuser-only; cascadeDelete cleans up when
// the trip or invitee is deleted.

migrate(
  (app) => {
    const usersId = app.findCollectionByNameOrId('users').id;
    const tripsId = app.findCollectionByNameOrId('trips').id;

    const invitations = new Collection({
      type: 'base',
      name: 'trip_invitations',
      fields: [
        {
          name: 'trip',
          type: 'relation',
          required: true,
          collectionId: tripsId,
          maxSelect: 1,
          cascadeDelete: true
        },
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: true
        },
        {
          name: 'invited_by',
          type: 'relation',
          required: false,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: false
        },
        { name: 'role', type: 'select', maxSelect: 1, values: ['organizer', 'guest'] },
        { name: 'status', type: 'select', maxSelect: 1, values: ['pending', 'accepted', 'declined'] },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
      ],
      indexes: [
        'CREATE INDEX idx_trip_invitations_user ON trip_invitations (user)',
        'CREATE UNIQUE INDEX idx_trip_invitations_trip_user ON trip_invitations (trip, user)'
      ],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null
    });
    app.save(invitations);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('trip_invitations'));
    } catch (_) {
      // already gone
    }
  }
);
