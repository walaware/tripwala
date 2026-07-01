import { fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { loadUserIdeas } from '$lib/server/ideas.js';
import { createTrip, TripCreateError } from '$lib/server/createTrip.js';
import { getMembership } from '$lib/server/membership.js';

const MAX_NAME = 200;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  if (!locals.user) throw redirect(303, '/login?next=/ideas');
  const pb = await superuserPb();
  return { ideas: await loadUserIdeas(pb, locals.user.id) };
}

export const actions = {
  // Quick-add: title-only capture from the Composer → a new status='idea' trip.
  create: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/ideas');
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();

    if (!name) return fail(400, { createError: 'Give your idea a name.' });
    if (name.length > MAX_NAME) return fail(400, { createError: `Keep it under ${MAX_NAME} characters.` });

    const pb = await superuserPb();
    try {
      await createTrip(pb, locals.user, { name, status: 'idea' });
    } catch (err) {
      if (err instanceof TripCreateError) {
        return fail(502, { createError: 'Could not save that idea — please try again.' });
      }
      throw err;
    }
    return { created: true };
  },

  // Promote an idea to a real (planning) trip — one-field change. Organizer-only,
  // and the trip must be one the caller actually belongs to.
  promote: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/ideas');
    const form = await request.formData();
    const slug = String(form.get('slug') ?? '').trim();
    if (!slug) return fail(400, { promoteError: 'Missing idea.' });

    const pb = await superuserPb();
    /** @type {any} */
    let trip;
    try {
      trip = await pb.collection('trips').getFirstListItem(pb.filter('share_token = {:t}', { t: slug }));
    } catch (_) {
      return fail(404, { promoteError: 'Idea not found.' });
    }

    const me = await getMembership(pb, trip.id, locals.user.id);
    if (!me || me.status === 'pending') return fail(403, { promoteError: 'Join this trip first.' });
    if (me.role !== 'organizer') return fail(403, { promoteError: 'Organizers only.' });
    if (trip.status !== 'idea') return fail(400, { promoteError: 'That trip is no longer an idea.' });

    await pb.collection('trips').update(trip.id, { status: 'planning' });
    // It now belongs on the dated dashboard; send them into its planning canvas.
    throw redirect(303, `/${slug}`);
  }
};
