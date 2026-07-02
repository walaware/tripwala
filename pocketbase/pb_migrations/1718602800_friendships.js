/// <reference path="../pb_data/types.d.ts" />

// Friend graph (#30): a relationship layer between accounts, independent of any
// one trip. This is the foundation for invite-by-friend and friends-see-your-
// trips-on-a-calendar.
//
// Ordered-pair model: one row per pair of users, with `user_low`/`user_high`
// holding the two account ids sorted lexicographically (low < high). Because the
// pair is canonicalized, a friend request A→B and its reverse B→A map to the
// SAME (user_low, user_high) key — so the unique index physically rejects the
// duplicate and powers "auto-accept when both sides have asked". `requested_by`
// records who initiated (recovers direction while a request is pending).
//
// Both relations are required and always filled, so the "PocketBase stores an
// unfilled relation as '' " gotcha (which forced a non-unique index on
// participants.user) does NOT apply here — a real UNIQUE index is safe.
//
// status: pending (a request awaiting the other side) | accepted (mutual).
// Blocking is intentionally NOT modeled here (it's directional; friendship is
// symmetric) — a separate `blocks` collection can be added later if needed.
//
// CRUD is superuser-only — the browser never touches PocketBase; the SvelteKit
// server reads/writes via the superuser client, always scoped to the signed-in
// user. cascadeDelete on both user relations cleans up a deleted account's edges.

migrate(
  (app) => {
    const usersId = app.findCollectionByNameOrId('users').id;
    const userRel = (name) => ({
      name,
      type: 'relation',
      required: true,
      collectionId: usersId,
      maxSelect: 1,
      cascadeDelete: true
    });

    const friendships = new Collection({
      type: 'base',
      name: 'friendships',
      fields: [
        userRel('user_low'),
        userRel('user_high'),
        {
          name: 'requested_by',
          type: 'relation',
          required: true,
          collectionId: usersId,
          maxSelect: 1,
          cascadeDelete: false
        },
        { name: 'status', type: 'select', maxSelect: 1, values: ['pending', 'accepted'] },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_friendships_pair ON friendships (user_low, user_high)',
        // The composite already indexes the user_low prefix; this covers the
        // other branch of the "user_low = me || user_high = me" friend query.
        'CREATE INDEX idx_friendships_high ON friendships (user_high)'
      ],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null
    });
    app.save(friendships);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('friendships'));
    } catch (_) {
      // already gone
    }
  }
);
