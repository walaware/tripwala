import { json, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { markRead, markAllRead } from '$lib/server/notifications.js';
import { acceptFriendRequest, removeFriendship } from '$lib/server/friends.js';
import { acceptInvitation, declineInvitation } from '$lib/server/invitations.js';

// The notification bell's action endpoint. The shell bell (app-level, on every
// route) POSTs an op here: mark items read, or act inline on a friend request /
// trip invitation. Every op is scoped to the signed-in user server-side —
// PocketBase collection rules are superuser-only, so nothing is trusted from the
// client beyond the notification id it names.
//
// Body: { op, id? }
//   markRead     { id }        one item read
//   markAllRead                whole feed read
//   accept       { id }        accept the request/invite behind this notification
//   decline      { id }        decline it
//
// accept/decline resolve to the right domain handler by the notification's type,
// which (with the source-row `ref`) we read back from the notification itself so
// the client can't spoof it.

export async function POST({ request, locals }) {
  if (!locals.user) throw error(401, 'Sign in first');

  const pb = await superuserPb();
  const body = await request.json().catch(() => ({}));
  const op = String(body.op ?? '');
  const id = body.id ? String(body.id) : '';

  if (op === 'markAllRead') {
    await markAllRead(pb, locals.user.id);
    return json({ ok: true });
  }

  if (!id) throw error(400, 'Missing notification id');

  if (op === 'markRead') {
    await markRead(pb, locals.user.id, id);
    return json({ ok: true });
  }

  if (op === 'accept' || op === 'decline') {
    // Load the notification and confirm it's this user's before acting.
    let notif;
    try {
      notif = await pb.collection('notifications').getOne(id);
    } catch (_) {
      throw error(404, 'Notification not found');
    }
    if (notif.user !== locals.user.id) throw error(403, 'Not your notification');
    if (!notif.ref) throw error(400, 'Notification has no target');

    try {
      if (notif.type === 'friend_request') {
        if (op === 'accept') await acceptFriendRequest(pb, locals.user.id, notif.ref);
        else await removeFriendship(pb, locals.user.id, notif.ref);
      } else if (notif.type === 'trip_invitation') {
        if (op === 'accept') {
          const { share_token } = await acceptInvitation(pb, locals.user, notif.ref);
          return json({ ok: true, share_token });
        }
        await declineInvitation(pb, locals.user.id, notif.ref);
      } else {
        throw error(400, 'Unknown notification type');
      }
    } catch (/** @type {any} */ e) {
      // The domain handlers throw plain Errors on ownership/precondition failures.
      // A SvelteKit `error()` throw carries a numeric `status` — re-throw those.
      if (e?.status) throw e;
      throw error(400, 'Could not complete that action');
    }
    return json({ ok: true });
  }

  throw error(400, 'Unknown op');
}
