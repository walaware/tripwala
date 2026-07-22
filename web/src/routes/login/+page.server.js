import { redirect } from '@sveltejs/kit';
import { safeNext } from '$lib/server/authFlow.js';

// Google is the only way in. There is deliberately no password action here:
// with no SMTP-backed reset flow, a password account that loses its password is
// unrecoverable without hand-editing PocketBase, so the door is removed rather
// than left ajar. Accounts are still ordinary `users` records — PocketBase links
// a Google identity onto an existing account when the email matches, so anyone
// who signed up with a password before this change keeps their trips by signing
// in with Google on the same address. `pnpm audit:auth` lists who hasn't yet.

export function load({ locals, url }) {
  const next = safeNext(url.searchParams.get('next'));
  if (locals.user) throw redirect(303, next);
  // `from=trip` means they followed a (private) trip link while signed out — show
  // trip-focused copy so the sign-in gate reads as a step toward the trip, not a wall.
  return { next, fromTrip: url.searchParams.get('from') === 'trip', oauthError: url.searchParams.get('error') === 'oauth' };
}
