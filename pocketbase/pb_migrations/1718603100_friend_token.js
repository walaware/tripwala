/// <reference path="../pb_data/types.d.ts" />

// Shareable friend link (#30): a stable per-user token so you can send anyone an
// "add me as a friend" link — /add-friend/<friend_token> — the same way a trip
// has a share_token. Opening it (signed in) sends a friend request to this user.
//
// The token is generated lazily by the server the first time you open your
// /friends page, so this migration only adds the (optional) field. Unique when
// present; empty for users who haven't generated one yet.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new Field({ name: 'friend_token', type: 'text', max: 64, pattern: '^[a-zA-Z0-9_-]*$' }));
    users.indexes = [
      ...users.indexes,
      'CREATE UNIQUE INDEX idx_users_friend_token ON users (friend_token) WHERE friend_token != \'\''
    ];
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.indexes = users.indexes.filter((i) => !i.includes('idx_users_friend_token'));
    users.fields.removeByName('friend_token');
    app.save(users);
  }
);
