// Notification feed (bell surface). A per-user stream of actionable events —
// friend requests and trip invitations today — backed by the `notifications`
// collection. Producers (sendFriendRequest, inviteFriendToTrip) call `raise()`
// when an event fires; the resolvers (accept/decline) call `resolve()` to drop
// the item once acted on. The layout loads `listNotifications` + `unreadCount`
// so the shell bell has data on every page.
//
// All reads/writes are superuser-mediated and scoped to a user id server-side —
// the browser never touches PocketBase.

import { avatarUrl } from './userAvatar.js';
import { displayName } from '../displayName.js';

/** How many live items the bell shows at once. */
const FEED_LIMIT = 30;

/**
 * Raise (upsert) a notification for a recipient. Keyed on (user, type, ref) so
 * re-firing the same event — e.g. a re-sent trip invite — refreshes the existing
 * row (and un-dismisses / un-reads it) instead of stacking duplicates.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ user: string, type: 'friend_request'|'trip_invitation', actor?: string, trip?: string, ref?: string }} evt
 */
export async function raise(pb, { user, type, actor, trip, ref }) {
  if (!user || !type) return null;
  const data = {
    user,
    type,
    actor: actor || null,
    trip: trip || null,
    ref: ref || '',
    read: false,
    dismissed: false
  };
  try {
    return await pb.collection('notifications').create(data);
  } catch (_) {
    // Unique (user, type, ref) collision — refresh the existing row.
    try {
      const existing = await pb.collection('notifications').getFirstListItem(
        pb.filter('user = {:u} && type = {:t} && ref = {:r}', { u: user, t: type, r: ref || '' })
      );
      return await pb.collection('notifications').update(existing.id, {
        actor: actor || null,
        trip: trip || null,
        read: false,
        dismissed: false
      });
    } catch (_) {
      return null;
    }
  }
}

/**
 * Resolve the notification raised for a source row — mark it dismissed so it
 * drops out of the feed once the user has acted on (or the request was revoked).
 * No-op if none exists.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ user: string, type: 'friend_request'|'trip_invitation', ref: string }} evt
 */
export async function resolve(pb, { user, type, ref }) {
  if (!user || !type || !ref) return;
  try {
    const row = await pb.collection('notifications').getFirstListItem(
      pb.filter('user = {:u} && type = {:t} && ref = {:r}', { u: user, t: type, r: ref })
    );
    if (!row.dismissed) await pb.collection('notifications').update(row.id, { dismissed: true });
  } catch (_) {
    // nothing to resolve
  }
}

/**
 * The recipient's live feed (non-dismissed), newest first, shaped for the shell
 * bell. Each item carries the presentation bits; the layout adds the inline
 * accept/decline handlers.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 */
export async function listNotifications(pb, userId) {
  if (!userId) return [];
  const rows = await pb.collection('notifications').getList(1, FEED_LIMIT, {
    filter: pb.filter('user = {:u} && dismissed = false', { u: userId }),
    expand: 'actor,trip',
    sort: '-created'
  });
  return rows.items.map((r) => {
    const actor = r.expand?.actor ?? null;
    const trip = r.expand?.trip ?? null;
    const actorName = actor ? displayName(actor.name || '', actor) : 'Someone';
    return {
      id: r.id,
      type: r.type,
      ref: r.ref || '',
      read: !!r.read,
      created: r.created,
      actor: actor
        ? { id: actor.id, name: actorName, avatar: avatarUrl(actor) }
        : null,
      trip: trip ? { name: trip.name || '', share_token: trip.share_token } : null,
      // A ready-made headline the bell can render as `title` directly.
      title:
        r.type === 'friend_request'
          ? `${actorName} sent you a friend request`
          : `${actorName} invited you to ${trip?.name || 'a trip'}`
    };
  });
}

/**
 * Unread badge count (live, non-dismissed, not yet read).
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 */
export async function unreadCount(pb, userId) {
  if (!userId) return 0;
  const res = await pb.collection('notifications').getList(1, 1, {
    filter: pb.filter('user = {:u} && dismissed = false && read = false', { u: userId }),
    fields: 'id'
  });
  return res.totalItems;
}

/**
 * Mark a single notification read (only if it's mine).
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @param {string} id
 */
export async function markRead(pb, userId, id) {
  if (!userId || !id) return;
  const row = await pb.collection('notifications').getOne(id);
  if (row.user !== userId) throw new Error('Not your notification');
  if (!row.read) await pb.collection('notifications').update(id, { read: true });
}

/**
 * Mark all of a user's live notifications read (the bell's "Mark all read").
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 */
export async function markAllRead(pb, userId) {
  if (!userId) return;
  const rows = await pb.collection('notifications').getFullList({
    filter: pb.filter('user = {:u} && dismissed = false && read = false', { u: userId }),
    fields: 'id'
  });
  for (const r of rows) {
    await pb.collection('notifications').update(r.id, { read: true });
  }
}
