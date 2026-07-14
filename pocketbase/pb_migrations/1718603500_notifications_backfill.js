/// <reference path="../pb_data/types.d.ts" />

// Backfill the notification feed from requests/invites that were already pending
// when the `notifications` collection shipped — so the bell isn't empty for users
// with outstanding items on first deploy. One row per source, keyed the same way
// raise() keys them (user, type, ref) so live events upsert cleanly afterwards.
//
// Idempotent: each create is wrapped so a re-run (or a row raise() already
// created) is skipped on the unique (user, type, ref) index. Down is a no-op —
// the collection's own migration drops everything on rollback.

migrate(
  (app) => {
    const notifs = app.findCollectionByNameOrId('notifications');

    /** Save one notification row; swallow the unique-index collision on re-run. */
    const put = (fields) => {
      const rec = new Record(notifs);
      for (const k of Object.keys(fields)) rec.set(k, fields[k]);
      try {
        app.save(rec);
      } catch (_) {
        // already present (unique user/type/ref) — skip
      }
    };

    // Pending friend requests → notify the addressee (the side that didn't ask).
    const friendships = app.findRecordsByFilter('friendships', "status = 'pending'");
    for (const f of friendships) {
      const requester = f.getString('requested_by');
      const low = f.getString('user_low');
      const high = f.getString('user_high');
      const addressee = requester === low ? high : low;
      if (!addressee) continue;
      put({
        user: addressee,
        type: 'friend_request',
        actor: requester,
        ref: f.id,
        read: false,
        dismissed: false
      });
    }

    // Pending trip invitations → notify the invitee.
    const invites = app.findRecordsByFilter('trip_invitations', "status = 'pending'");
    for (const inv of invites) {
      const user = inv.getString('user');
      if (!user) continue;
      put({
        user,
        type: 'trip_invitation',
        actor: inv.getString('invited_by'),
        trip: inv.getString('trip'),
        ref: inv.id,
        read: false,
        dismissed: false
      });
    }
  },
  (_app) => {
    // No-op: the notifications collection migration owns teardown.
  }
);
