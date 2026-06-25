// Load the planning-phase data for a trip: who's interested, owner-proposed date
// options (with vote tallies), free-pick availability (heatmap), and location
// ideas (with upvotes). Shaped for PlanningView; the caller adds trip + the
// viewer's membership.

import { participantName } from '../displayName.js';
import { avatarUrl } from './userAvatar.js';
import { locationImageUrl } from './locationMedia.js';

/** @param {string|undefined|null} d a PB datetime → "YYYY-MM-DD" */
const dateOnly = (d) => String(d ?? '').slice(0, 10);

/**
 * @param {import('pocketbase').default} pb superuser client
 * @param {{ id: string }} trip
 * @param {string} myParticipantId
 */
export async function loadPlanning(pb, trip, myParticipantId) {
  const tripFilter = pb.filter('trip = {:id}', { id: trip.id });
  const viaOptionTrip = pb.filter('date_option.trip = {:id}', { id: trip.id });
  const viaIdeaTrip = pb.filter('location_idea.trip = {:id}', { id: trip.id });

  const [participantsAll, dateOptions, dateVotes, ideas, locVotes] = await Promise.all([
    pb.collection('participants').getFullList({ filter: tripFilter, sort: 'display_name', expand: 'user' }),
    pb.collection('date_options').getFullList({ filter: tripFilter, sort: 'start_date' }),
    pb.collection('date_votes').getFullList({ filter: viaOptionTrip }),
    pb.collection('location_ideas').getFullList({ filter: tripFilter, sort: 'created' }),
    pb.collection('location_votes').getFullList({ filter: viaIdeaTrip })
  ]);

  // Pending link-join requests aren't members yet — exclude from crew + counts.
  const participants = participantsAll.filter((p) => p.status !== 'pending');

  /** @type {Record<string,string>} */
  const nameById = Object.fromEntries(participants.map((p) => [p.id, participantName(p)]));

  // Date options + per-option tallies and my vote.
  /** @type {Record<string, {yes:number,maybe:number,no:number,mine:string|null}>} */
  const optTally = {};
  for (const o of dateOptions) optTally[o.id] = { yes: 0, maybe: 0, no: 0, mine: null };
  for (const v of dateVotes) {
    const t = optTally[v.date_option];
    if (!t) continue;
    const vv = String(v.vote);
    if (vv === 'yes' || vv === 'maybe' || vv === 'no') t[vv]++;
    if (v.participant === myParticipantId) t.mine = vv;
  }
  const options = dateOptions.map((o) => ({
    id: o.id,
    start_date: o.start_date,
    end_date: o.end_date || o.start_date,
    ...optTally[o.id]
  }));

  // Free-pick availability heatmap + mine.
  /** @type {Record<string, number>} */
  const byDay = {};
  /** @type {string[]} */
  let mine = [];
  for (const p of participants) {
    const days = Array.isArray(p.available_dates) ? p.available_dates : [];
    for (const d of days) byDay[d] = (byDay[d] ?? 0) + 1;
    if (p.id === myParticipantId) mine = days.slice();
  }

  // Location ideas + upvotes.
  /** @type {Record<string, {count:number, mine:boolean}>} */
  const ideaVotes = {};
  for (const i of ideas) ideaVotes[i.id] = { count: 0, mine: false };
  for (const v of locVotes) {
    const t = ideaVotes[v.location_idea];
    if (!t) continue;
    t.count++;
    if (v.participant === myParticipantId) t.mine = true;
  }
  const locations = ideas
    .map((i) => ({
      id: i.id,
      label: i.label,
      url: i.url || '',
      note: i.note || '',
      suggester: i.participant ? nameById[i.participant] ?? 'Someone' : '',
      mineParticipant: i.participant || '', // who suggested it (for "your idea" upload rights)
      image: locationImageUrl(i), // uploaded/drag-dropped picture (overrides preview)
      previewImage: i.preview_image || '', // og:image URL the browser loads directly
      previewTitle: i.preview_title || '',
      previewDescription: i.preview_description || '',
      votes: ideaVotes[i.id].count,
      mine: ideaVotes[i.id].mine
    }))
    .sort((a, b) => b.votes - a.votes);

  // Account-linked members + the current viewer (for the inline Trip-settings section).
  const meRec = participants.find((p) => p.id === myParticipantId);
  return {
    participants: participants.map((p) => ({
      id: p.id,
      display_name: participantName(p),
      avatar: avatarUrl(p.expand?.user), // Google/uploaded photo if they have an account
      role: p.role || 'guest'
    })),
    members: participants
      .filter((p) => p.user)
      .map((p) => ({ id: p.id, display_name: participantName(p), role: p.role || 'guest' }))
      .sort((a, b) => (a.role === b.role ? 0 : a.role === 'organizer' ? -1 : 1)),
    me: meRec ? { name: participantName(meRec), notify: meRec.notify !== false } : null,
    dateOptions: options,
    availability: { byDay, mine, memberCount: participants.length },
    locations
  };
}

export { dateOnly };
