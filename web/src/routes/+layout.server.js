// Surface the signed-in user to every page so the layout (and any page) can
// render auth state without each load() re-deriving it. Also loads the shell's
// notification feed (bell) — app-level, so it's present on every route.
import { superuserPb } from '$lib/server/pocketbase.js';
import { listNotifications, unreadCount } from '$lib/server/notifications.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
  if (!locals.user) return { user: null, notifications: [], notificationsUnread: 0 };
  const pb = await superuserPb();
  const [notifications, notificationsUnread] = await Promise.all([
    listNotifications(pb, locals.user.id),
    unreadCount(pb, locals.user.id)
  ]);
  return { user: locals.user, notifications, notificationsUnread };
}
