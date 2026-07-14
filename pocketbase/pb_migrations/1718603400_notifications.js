/// <reference path="../pb_data/types.d.ts" />

// Notification feed (bell surface): a per-user, app-level stream of actionable
// events — today friend requests and trip invitations, extensible to more event
// types later. Unlike the dashboard's ad-hoc "pending" reads, this is a durable
// record with read/dismissed state so the bell can show an unread count, a "mark
// all read" action, and keep a short history after the underlying request is
// gone.
//
// A notification points at the source row it was raised for via (`type`, `ref`)
// — e.g. type='friend_request', ref=<friendships row id>. That pair is unique
// per recipient so re-raising the same event (e.g. a re-sent trip invite) upserts
// the existing row instead of piling up duplicates. When the user acts on the
// item (accept/decline), the server flips `dismissed` so it drops out of the feed.
//
// read:      false until the user opens the bell / clicks the item.
// dismissed: true once the underlying request is resolved (acted on or revoked).
//
// CRUD is superuser-only — the browser never touches PocketBase; the SvelteKit
// server reads/writes via the superuser client, always scoped to the signed-in
// user. cascadeDelete on `user` cleans up a deleted account's feed; `actor` and
// `trip` also cascade so a notification never dangles past its subject.

migrate(
  (app) => {
    const usersId = app.findCollectionByNameOrId('users').id;
    const tripsId = app.findCollectionByNameOrId('trips').id;

    const notifications = new Collection({
      type: 'base',
      name: 'notifications',
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: true
        },
        {
          name: 'type',
          type: 'select',
          maxSelect: 1,
          values: ['friend_request', 'trip_invitation']
        },
        {
          name: 'actor',
          type: 'relation',
          required: false,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: true
        },
        {
          name: 'trip',
          type: 'relation',
          required: false,
          collectionId: tripsId,
          maxSelect: 1,
          cascadeDelete: true
        },
        // Source row id (a friendships / trip_invitations id) the event was
        // raised for. Text, not a relation, because it spans collections.
        { name: 'ref', type: 'text', required: false, max: 255 },
        { name: 'read', type: 'bool' },
        { name: 'dismissed', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
      ],
      indexes: [
        // The feed query: a user's live (non-dismissed) items, newest first.
        'CREATE INDEX idx_notifications_user ON notifications (user, dismissed, created)',
        // Upsert key: one row per (recipient, event type, source row).
        'CREATE UNIQUE INDEX idx_notifications_ref ON notifications (user, type, ref)'
      ],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null
    });
    app.save(notifications);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('notifications'));
    } catch (_) {
      // already gone
    }
  }
);
