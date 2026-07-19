import { fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { createTrip, TripCreateError, TRIP_STATUSES } from '$lib/server/createTrip.js';
import { immichConfigured } from '$lib/server/immich.js';
import { isVisibility, defaultTripVisibility } from '$lib/visibility.js';

const MAX = { name: 200, location: 300, description: 5000 };

/** @param {string} v */
const clean = (v) => v.trim();

export async function load({ locals }) {
  // Must be signed in to plan a trip.
  if (!locals.user) throw redirect(303, '/login?next=/new');
  return {
    // Only offer the Immich album opt-in when the instance has Immich configured.
    immichEnabled: await immichConfigured(),
    // Prefill the calendar-sharing control from the creator's saved preference,
    // so it's a visible choice at creation rather than a setting to discover later.
    visibility: defaultTripVisibility(locals.user)
  };
}

export const actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/login?next=/new');
    const form = await request.formData();
    const name = clean(String(form.get('name') ?? ''));
    const location = clean(String(form.get('location') ?? ''));
    const start_date = clean(String(form.get('start_date') ?? ''));
    const end_date = clean(String(form.get('end_date') ?? ''));
    const description = clean(String(form.get('description') ?? ''));
    const expense_link = clean(String(form.get('expense_link') ?? ''));
    let status = clean(String(form.get('status') ?? 'confirmed'));
    if (!TRIP_STATUSES.includes(status)) status = 'confirmed';
    const trip_type = clean(String(form.get('trip_type') ?? ''));
    const create_album = Boolean(form.get('create_album'));
    // An unrecognised value falls back to the user's default rather than to the
    // most-shared tier — a tampered form must never over-share.
    const submitted = clean(String(form.get('visibility') ?? ''));
    const visibility = isVisibility(submitted) ? submitted : defaultTripVisibility(locals.user);

    // Boundary validation — fail fast with field-level messages.
    /** @type {Record<string, string>} */
    const errors = {};
    const values = { name, location, start_date, end_date, description, expense_link, status, trip_type, visibility };

    if (!name) errors.name = 'Give your trip a name.';
    else if (name.length > MAX.name) errors.name = `Keep it under ${MAX.name} characters.`;
    if (location.length > MAX.location) errors.location = `Keep it under ${MAX.location} characters.`;
    if (description.length > MAX.description) errors.description = `That description is too long.`;
    if (start_date && end_date && end_date < start_date) {
      errors.end_date = 'End date cannot be before the start date.';
    }
    if (expense_link && !/^https?:\/\/.+/i.test(expense_link)) {
      errors.expense_link = 'Enter a full URL starting with http(s)://';
    }

    if (Object.keys(errors).length) return fail(400, { errors, values });

    const pb = await superuserPb();
    try {
      const result = await createTrip(pb, locals.user, {
        name,
        location,
        start_date,
        end_date,
        description,
        expense_link,
        status,
        trip_type,
        create_album,
        visibility
      });
      return {
        created: {
          name: result.trip.name,
          share_token: result.share_token,
          invite_token: result.trip.invite_token || '',
          owner_token: result.owner_token,
          mealSlots: result.mealSlots,
          albumRequested: result.albumRequested,
          albumCreated: result.albumCreated
        }
      };
    } catch (err) {
      if (err instanceof TripCreateError) {
        return fail(502, { errors: { _form: 'Could not create the trip — please try again.' }, values });
      }
      throw err;
    }
  }
};
