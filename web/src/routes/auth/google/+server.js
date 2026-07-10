import { redirect, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { OAUTH, oauthCookieOpts, safeNext } from '$lib/server/authFlow.js';
import { rateLimit, clientIp } from '$lib/server/rateLimit.js';

// Start the Google OAuth2 handshake. PocketBase builds the provider authURL
// (with its configured client id + a fresh state/PKCE pair); we append our
// callback URL, stash state + verifier in short-lived cookies, and bounce the
// user to Google.
export async function GET(event) {
  const { locals, url, cookies } = event;

  // Sign-in is the only unauthenticated write-ish path left (it can mint a user
  // record on first Google login) and each hit costs a PocketBase round trip.
  // Generous enough that a human retrying never notices.
  const limited = rateLimit(`oauth-start:${clientIp(event)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) throw error(429, 'Too many sign-in attempts — wait a minute and try again.');

  let google;
  try {
    const methods = await locals.pb.collection('users').listAuthMethods();
    google = methods.oauth2?.providers?.find((/** @type {any} */ p) => p.name === 'google');
  } catch (/** @type {any} */ e) {
    throw error(502, 'Could not reach the auth backend');
  }
  if (!google) throw error(503, 'Google sign-in is not configured.');

  const redirectUrl = `${url.origin}/auth/callback`;
  const opts = oauthCookieOpts(!dev);
  cookies.set(OAUTH.state, google.state, opts);
  cookies.set(OAUTH.verifier, google.codeVerifier, opts);
  cookies.set(OAUTH.next, safeNext(url.searchParams.get('next')), opts);

  throw redirect(303, google.authURL + encodeURIComponent(redirectUrl));
}
