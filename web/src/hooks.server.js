import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { rateLimit, clientIp } from '$lib/server/rateLimit.js';
import { newClient } from '$lib/server/pocketbase.js';
import { avatarUrl } from '$lib/server/userAvatar.js';

const AUTH_COOKIE = 'pb_auth';

// Coarse global rate limit per client IP — a backstop against someone scraping
// trip URLs or hammering endpoints. Generous enough that normal use (incl. the
// ~4s live-poll) never trips it. Sensitive POSTs add stricter limits at the
// point of use.
const GLOBAL = { limit: 300, windowMs: 60_000 };

/** @type {import('@sveltejs/kit').Handle} */
const handleRateLimit = async ({ event, resolve }) => {
  const p = event.url.pathname;
  const metered = !p.startsWith('/_app/') && !p.startsWith('/favicon');
  if (metered) {
    const { ok, retryAfter } = rateLimit(`g:${clientIp(event)}`, GLOBAL);
    if (!ok) {
      return new Response('Too many requests — slow down a moment.', {
        status: 429,
        headers: { 'retry-after': String(retryAfter) }
      });
    }
  }
  return resolve(event);
};

// Hydrate the signed-in user from the pb_auth cookie. Validation is local
// (token expiry) — no network round-trip per request, so the live-poll stays
// cheap. Auth operations (login/OAuth/logout) mutate event.locals.pb; the
// updated cookie is serialized back here after the response is produced.
/** @type {import('@sveltejs/kit').Handle} */
const handleAuth = async ({ event, resolve }) => {
  const pb = newClient();
  pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '', AUTH_COOKIE);
  if (!pb.authStore.isValid) pb.authStore.clear();

  event.locals.pb = pb;
  const rec = pb.authStore.record;
  event.locals.user = rec
    ? {
        id: rec.id,
        email: rec.email,
        name: rec.name ?? '',
        avatar: avatarUrl(rec) ?? '',
        nickname: rec.nickname ?? '',
        show_last_name: rec.show_last_name === true,
        temp_unit: rec.temp_unit ?? '',
        map_app: rec.map_app ?? '',
        default_trip_visibility: rec.default_trip_visibility ?? ''
      }
    : null;

  const response = await resolve(event);

  response.headers.append(
    'set-cookie',
    pb.authStore.exportToCookie(
      { httpOnly: true, secure: !dev, sameSite: 'Lax', path: '/' },
      AUTH_COOKIE
    )
  );
  return response;
};

export const handle = sequence(handleRateLimit, handleAuth);
