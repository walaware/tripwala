import { error, fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { getMembership } from '$lib/server/membership.js';

// Organizer-only "Trip settings": edit trip details, copy the share +
// co-organizer links, and manage members. Gated to a signed-in organizer
// member (distinct from the /edit?owner= claim link, which is how someone
// *becomes* an organizer in the first place).

const MAX = { name: 200, location: 300, description: 5000 };

/** @param {string} v */
const clean = (v) => v.trim();
/** PocketBase date → yyyy-mm-dd for <input type=date>. @param {string} d */
const fromPb = (d) => (d || '').slice(0, 10);
/** yyyy-mm-dd → PocketBase datetime. @param {string} d */
const toPb = (d) => (d ? `${d} 00:00:00.000Z` : '');

/** Stored description is `<p>…</p>` with <br>; turn it back into plain text. @param {string} html */
function descToText(html) {
  return (html || '')
    .replace(/^<p>/i, '')
    .replace(/<\/p>$/i, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
/** Plain text → safe stored HTML. @param {string} s */
function textToHtml(s) {
  const esc = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return esc ? `<p>${esc}</p>` : '';
}

/**
 * Resolve a trip + require the signed-in user to be an organizer of it.
 * @param {string} shareToken
 * @param {{ id: string } | null | undefined} user
 */
async function requireOrganizer(shareToken, user) {
  const pb = await superuserPb();
  let trip;
  try {
    trip = await pb
      .collection('trips')
      .getFirstListItem(pb.filter('share_token = {:t}', { t: shareToken }));
  } catch (/** @type {any} */ err) {
    if (err?.status === 404) throw error(404, 'Trip not found');
    throw error(502, 'Could not reach the trip backend');
  }
  if (!user) {
    throw redirect(303, `/login?next=${encodeURIComponent(`/${shareToken}/settings`)}`);
  }
  const membership = await getMembership(pb, trip.id, user.id);
  if (!membership || membership.role !== 'organizer') {
    throw error(403, 'Only organizers can change trip settings.');
  }
  return { pb, trip, membership };
}

/** @param {any} pb @param {string} tripId @param {string} meId */
async function listMembers(pb, tripId, meId) {
  const all = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('trip = {:t}', { t: tripId }), sort: 'display_name' });
  return all
    .filter((/** @type {any} */ p) => p.user) // members = participants linked to an account
    .map((/** @type {any} */ p) => ({
      id: p.id,
      display_name: p.display_name,
      role: p.role || 'guest',
      isYou: p.id === meId
    }))
    .sort((/** @type {any} */ a, /** @type {any} */ b) =>
      a.role === b.role ? 0 : a.role === 'organizer' ? -1 : 1
    );
}

export async function load({ params, locals }) {
  const { pb, trip, membership } = await requireOrganizer(params.share_token, locals.user);
  return {
    shareToken: trip.share_token,
    ownerToken: trip.owner_token,
    inviteToken: trip.invite_token || '',
    status: trip.status || 'confirmed',
    values: {
      name: trip.name || '',
      trip_type: trip.trip_type || '',
      location: trip.location || '',
      start_date: fromPb(trip.start_date),
      end_date: fromPb(trip.end_date),
      description: descToText(trip.description),
      expense_link: trip.expense_link || ''
    },
    members: await listMembers(pb, trip.id, membership.id)
  };
}

export const actions = {
  // Edit the trip's core details.
  update: async ({ request, params, locals }) => {
    const { pb, trip } = await requireOrganizer(params.share_token, locals.user);
    const form = await request.formData();
    const name = clean(String(form.get('name') ?? ''));
    const trip_type = clean(String(form.get('trip_type') ?? ''));
    const location = clean(String(form.get('location') ?? ''));
    const start_date = clean(String(form.get('start_date') ?? ''));
    const end_date = clean(String(form.get('end_date') ?? ''));
    const description = clean(String(form.get('description') ?? ''));
    const expense_link = clean(String(form.get('expense_link') ?? ''));

    /** @type {Record<string,string>} */
    const errors = {};
    const values = { name, trip_type, location, start_date, end_date, description, expense_link };
    if (!name) errors.name = 'Give your trip a name.';
    else if (name.length > MAX.name) errors.name = `Keep it under ${MAX.name} characters.`;
    if (location.length > MAX.location) errors.location = `Keep it under ${MAX.location} characters.`;
    if (description.length > MAX.description) errors.description = 'That description is too long.';
    if (start_date && end_date && end_date < start_date) {
      errors.end_date = 'End date cannot be before the start date.';
    }
    if (expense_link && !/^https?:\/\/.+/i.test(expense_link)) {
      errors.expense_link = 'Enter a full URL starting with http(s)://';
    }
    if (Object.keys(errors).length) return fail(400, { errors, values });

    try {
      await pb.collection('trips').update(trip.id, {
        name,
        trip_type,
        location,
        start_date: toPb(start_date),
        end_date: toPb(end_date),
        description: textToHtml(description),
        expense_link
      });
    } catch (_) {
      return fail(502, { errors: { _form: 'Could not save — please try again.' }, values });
    }
    return { saved: true };
  },

  // Promote a guest to organizer or demote an organizer to guest.
  setRole: async ({ request, params, locals }) => {
    const { pb, trip } = await requireOrganizer(params.share_token, locals.user);
    const form = await request.formData();
    const participantId = String(form.get('participantId') ?? '');
    const role = String(form.get('role') ?? '');
    if (!participantId || !['organizer', 'guest'].includes(role)) {
      return fail(400, { memberError: 'Invalid request.' });
    }
    const target = await pb.collection('participants').getOne(participantId).catch(() => null);
    if (!target || target.trip !== trip.id) return fail(400, { memberError: 'Not part of this trip.' });

    // Never leave a trip with zero organizers.
    if (role === 'guest' && target.role === 'organizer') {
      const orgs = await pb
        .collection('participants')
        .getFullList({ filter: pb.filter('trip = {:t} && role = "organizer"', { t: trip.id }) });
      if (orgs.length <= 1) return fail(400, { memberError: 'A trip needs at least one organizer.' });
    }
    await pb.collection('participants').update(participantId, { role });
    return { memberSaved: true };
  },

  // Remove a member and their contributions (gear claims, meal sign-ups, packing).
  removeMember: async ({ request, params, locals }) => {
    const { pb, trip } = await requireOrganizer(params.share_token, locals.user);
    const form = await request.formData();
    const participantId = String(form.get('participantId') ?? '');
    if (!participantId) return fail(400, { memberError: 'Invalid request.' });
    const target = await pb.collection('participants').getOne(participantId).catch(() => null);
    if (!target || target.trip !== trip.id) return fail(400, { memberError: 'Not part of this trip.' });

    if (target.role === 'organizer') {
      const orgs = await pb
        .collection('participants')
        .getFullList({ filter: pb.filter('trip = {:t} && role = "organizer"', { t: trip.id }) });
      if (orgs.length <= 1) return fail(400, { memberError: 'Demote them first — a trip needs an organizer.' });
    }

    for (const coll of ['gear_claims', 'meal_signups', 'packing_items']) {
      const rows = await pb
        .collection(coll)
        .getFullList({ filter: pb.filter('participant = {:p}', { p: participantId }) })
        .catch(() => []);
      for (const r of rows) await pb.collection(coll).delete(r.id).catch(() => {});
    }
    await pb.collection('participants').delete(participantId).catch(() => {});
    return { memberRemoved: true };
  }
};
