// Build the Open Graph / Twitter-card metadata a trip link shows when pasted
// into Telegram, iMessage, Slack, etc. Link-preview crawlers fetch the page
// WITHOUT a session cookie, so this has to work off the public trip row alone —
// it never depends on the viewer being a member.
//
// Image choice mirrors the on-page hero:
//   - planning trips   → the current top-voted location idea's picture
//   - confirmed / done → the picked location's picture (falling back to the
//                        top-voted idea if no pick is locked in yet)
// A member-uploaded image wins over an unfurled og:image, same as the cards.

import { previewText } from './teaser.js';
import { locationImageUrl } from './locationMedia.js';
import { fmtDateRange } from '../format.js';

/**
 * Best image for one idea: the member upload (as a large thumb) if present,
 * otherwise the link-preview image we unfurled, otherwise nothing.
 * @param {{ id: string, image?: string | null, preview_image?: string | null } | null | undefined} idea
 * @param {string} [thumb] PocketBase thumb size for the uploaded image
 * @returns {string | undefined} a same-origin path or an absolute external URL
 */
export function ideaImage(idea, thumb = '1000x0') {
  if (!idea) return undefined;
  return locationImageUrl(idea, thumb) || idea.preview_image || undefined;
}

/**
 * Order ideas by upvote count, descending. Pure — no DB access.
 * @param {Array<{ id: string }>} ideas
 * @param {Array<{ location_idea: string }>} votes
 * @returns {Array<{ id: string }>} a new sorted array
 */
export function rankByVotes(ideas, votes) {
  /** @type {Record<string, number>} */
  const tally = {};
  for (const v of votes) tally[v.location_idea] = (tally[v.location_idea] ?? 0) + 1;
  return [...ideas].sort((a, b) => (tally[b.id] ?? 0) - (tally[a.id] ?? 0));
}

/**
 * Turn a maybe-relative image reference into something a crawler can fetch.
 * Same-origin paths get the public origin prefixed; absolute URLs pass through.
 * @param {string | undefined} ref
 * @param {string} origin e.g. "https://tripwala.enzoiwith.us"
 * @returns {string | undefined}
 */
export function absolutize(ref, origin) {
  if (!ref) return undefined;
  return /^https?:\/\//i.test(ref) ? ref : `${origin}${ref}`;
}

/**
 * The picture for a trip's link preview, as a same-origin path or external URL.
 * @param {import('pocketbase').default} pb superuser client
 * @param {any} trip a trips record (expand `picked_location` for confirmed trips)
 * @returns {Promise<string | undefined>}
 */
async function ogImageRef(pb, trip) {
  const status = trip.status || 'confirmed';

  // Confirmed / completed: prefer the chosen location's hero picture.
  if (status !== 'planning') {
    const picked = trip.expand?.picked_location;
    const url = ideaImage(picked);
    if (url) return url;
  }

  // Planning (or a confirmed trip with no pick yet): the most-loved idea.
  const [ideas, votes] = await Promise.all([
    pb.collection('location_ideas').getFullList({ filter: pb.filter('trip = {:id}', { id: trip.id }) }).catch(() => []),
    pb.collection('location_votes').getFullList({ filter: pb.filter('location_idea.trip = {:id}', { id: trip.id }) }).catch(() => [])
  ]);
  if (!ideas.length) return undefined;
  for (const idea of rankByVotes(ideas, /** @type {Array<{ location_idea: string }>} */ (votes))) {
    const url = ideaImage(idea);
    if (url) return url;
  }
  return undefined;
}

/**
 * A deliberately-sparse Open Graph payload for signed-out link-preview crawlers.
 * Trip pages are private, so a bot only ever gets the trip's name (or a generic
 * title) — never the location, dates, description, or hero photo that `tripOg`
 * exposes to signed-in members.
 * @param {any} trip a trips record
 * @param {string} origin the public origin (from the request URL)
 * @returns {{ title: string, description: string, url: string, image?: string }}
 */
export function crawlerOg(trip, origin) {
  return {
    title: trip.name || 'An adventure on tripwala',
    description: "You've been invited to a trip on tripwala. Sign in to see the plan.",
    url: `${origin}/${trip.share_token}`
  };
}

/**
 * Assemble the full Open Graph payload the page head renders.
 * @param {import('pocketbase').default} pb superuser client
 * @param {any} trip a trips record
 * @param {string} origin the public origin (from the request URL)
 * @returns {Promise<{ title: string, description: string, url: string, image?: string }>}
 */
export async function tripOg(pb, trip, origin) {
  const where = trip.location ? `Trip to ${trip.location}` : 'A trip on tripwala';
  const dates = fmtDateRange(trip.start_date, trip.end_date);
  const fallback = dates ? `${where} · ${dates}` : where;
  return {
    title: trip.name || 'tripwala',
    description: previewText(trip.description) || fallback,
    url: `${origin}/${trip.share_token}`,
    image: absolutize(await ogImageRef(pb, trip), origin)
  };
}
