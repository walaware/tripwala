/// <reference path="../pb_data/types.d.ts" />

// When an invite email was last actually sent. Two jobs:
//
// 1. Rate limiting. The "resend invite" action would otherwise be a free
//    email-bombing primitive — any member of a trip with the default
//    invite_visibility ('everyone') could loop it and hammer an arbitrary
//    address through our SMTP relay. The server refuses a resend within a
//    cooldown of this timestamp.
// 2. Telling the crew something useful: "sent 6 days ago, still nothing" is the
//    signal that an invite needs chasing, which is the whole reason invites are
//    visible in the first place.
//
// Nullable: rows created before this migration (and the invite_organizer path
// when SMTP is off and no mail went out) legitimately have no send.

migrate(
  (app) => {
    const invites = app.findCollectionByNameOrId('invites');
    invites.fields.add(
      new Field({
        name: 'last_sent',
        type: 'date',
        required: false
      })
    );
    app.save(invites);
  },
  (app) => {
    try {
      const invites = app.findCollectionByNameOrId('invites');
      invites.fields.removeById(invites.fields.getByName('last_sent').id);
      app.save(invites);
    } catch (_) {
      // collection or field already gone
    }
  }
);
