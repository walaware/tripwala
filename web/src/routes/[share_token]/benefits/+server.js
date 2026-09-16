import { json, error } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { getMembership } from '$lib/server/membership.js';
import { rateLimit, clientIp } from '$lib/server/rateLimit.js';
import { moneywalaConfigured, listBenefits, listChannels, evaluateBooking } from '$lib/server/moneywala.js';
import { dedupeCards, parseEvaluateRequest, shapeEvaluation } from '$lib/benefits.js';

// Benefits check for stay bookings (moneywala charter step 7). The browser
// talks to THIS endpoint only; the server relays to moneywala's tailnet API
// with the scoped service token (see $lib/server/moneywala.js). Members-only,
// same guard as the geocode proxy: household card data is not the business of
// anyone who merely holds the view-only share link.
//
//   GET  → picker data: cards dedup'd from GET /benefits + the live channel
//          values from GET /channels (household data, not an enum — verbatim)
//   POST → relay a validated evaluate-booking, return the shaped view model

/** @param {any} event @returns {Promise<void>} throws unless an active member */
async function requireMember(event) {
  const { params, locals } = event;
  if (!locals.user) throw error(401, 'Sign in to check benefits');
  const pb = await superuserPb();
  let trip;
  try {
    trip = await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: params.share_token }));
  } catch (_) {
    throw error(404, 'Trip not found');
  }
  const me = await getMembership(pb, trip.id, locals.user.id);
  if (!me || me.status === 'pending') throw error(403, 'Join this trip to check benefits');
}

/** @param {any} event */
function throttle(event) {
  const limited = rateLimit(`benefits:${clientIp(event)}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) throw error(429, 'Too many checks — give it a moment.');
}

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
  await requireMember(event);
  if (!moneywalaConfigured()) return json({ configured: false, cards: [], channels: [] });
  throttle(event);
  try {
    const [items, channels] = await Promise.all([listBenefits(), listChannels()]);
    return json({ configured: true, cards: dedupeCards(items), channels });
  } catch (/** @type {any} */ e) {
    console.error('moneywala benefits list failed:', e?.message || e);
    throw error(502, 'moneywala isn’t reachable right now — benefits check will be back.');
  }
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
  await requireMember(event);
  if (!moneywalaConfigured()) throw error(503, 'Benefits check isn’t set up on this instance.');
  throttle(event);

  let body;
  try {
    body = await event.request.json();
  } catch (_) {
    throw error(400, 'Bad request');
  }
  const parsed = parseEvaluateRequest(body);
  if (!parsed.ok) throw error(400, parsed.error);

  try {
    const raw = await evaluateBooking(parsed.payload);
    return json({ evaluation: shapeEvaluation(raw) });
  } catch (/** @type {any} */ e) {
    // moneywala's own 400s (e.g. unknown card) surface as-is — they're the
    // clearest message we have. Everything else degrades to a soft 502.
    if (e?.status === 400) throw error(400, e.message);
    console.error('moneywala evaluate-booking failed:', e?.message || e);
    throw error(502, 'moneywala isn’t reachable right now — benefits check will be back.');
  }
}
