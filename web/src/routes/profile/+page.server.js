import { fail, redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { avatarUrl } from '$lib/server/userAvatar.js';
import { isAdmin } from '$lib/server/admin.js';
import { isVisibility, defaultTripVisibility } from '$lib/visibility.js';

// Account/profile surface for the signed-in user. Collections are locked to
// superuser-only, so writes go through the superuser client — but ALWAYS scoped
// to `locals.user.id` (derived from the validated pb_auth cookie, never from the
// client), so you can only change your own photo.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  if (!locals.user) throw redirect(303, '/login?next=/profile');
  // Read the live record — the pb_auth cookie's copy can be stale right after a
  // change, so don't trust locals.user.* for the canonical display here.
  let avatar = locals.user.avatar || undefined;
  let nickname = locals.user.nickname || '';
  let showLastName = locals.user.show_last_name === true;
  let tempUnit = locals.user.temp_unit || '';
  let mapAppPref = locals.user.map_app || '';
  let tripVisibility = defaultTripVisibility(locals.user);
  try {
    const pb = await superuserPb();
    const rec = await pb.collection('users').getOne(locals.user.id);
    avatar = avatarUrl(rec);
    nickname = rec.nickname || '';
    showLastName = rec.show_last_name === true;
    tempUnit = rec.temp_unit || '';
    mapAppPref = rec.map_app || '';
    tripVisibility = defaultTripVisibility(rec);
  } catch (_) {
    /* fall back to the cookie copy */
  }
  return {
    name: locals.user.name || locals.user.email,
    email: locals.user.email,
    avatar,
    nickname,
    showLastName,
    tempUnit,
    mapApp: mapAppPref,
    tripVisibility,
    isAdmin: await isAdmin(locals.user)
  };
}

/** Best-effort: refresh the signed-in user's token so the header avatar (read
 * from the pb_auth cookie) reflects the change without a re-login. */
async function refreshSession(/** @type {App.Locals} */ locals) {
  try {
    await locals.pb.collection('users').authRefresh();
  } catch (_) {
    /* header catches up on next sign-in */
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  upload: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Please sign in again.' });
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose a photo first.' });
    if (!file.type.startsWith('image/')) return fail(400, { error: "That doesn't look like an image." });
    if (file.size > MAX_BYTES) return fail(400, { error: 'Image must be under 5 MB.' });

    const pb = await superuserPb();
    const fd = new FormData();
    fd.append('avatar', file, file.name || 'avatar');
    try {
      await pb.collection('users').update(locals.user.id, fd);
    } catch (_) {
      return fail(400, { error: 'Could not save that image — try a different one.' });
    }
    await refreshSession(locals);
    throw redirect(303, '/profile');
  },

  remove: async ({ locals }) => {
    if (!locals.user) return fail(401, { error: 'Please sign in again.' });
    const pb = await superuserPb();
    try {
      await pb.collection('users').update(locals.user.id, { avatar: null });
    } catch (_) {
      return fail(400, { error: 'Could not remove the photo.' });
    }
    await refreshSession(locals);
    throw redirect(303, '/profile');
  },

  // Name-display prefs: an optional nickname + whether to show the last name.
  prefs: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Please sign in again.' });
    const form = await request.formData();
    const nickname = String(form.get('nickname') ?? '').trim().slice(0, 100);
    const show_last_name = form.get('show_last_name') != null;
    const pb = await superuserPb();
    try {
      await pb.collection('users').update(locals.user.id, { nickname, show_last_name });
    } catch (_) {
      return fail(400, { error: 'Could not save your name settings.' });
    }
    await refreshSession(locals);
    throw redirect(303, '/profile');
  },

  // App preferences. Currently just the forecast temperature unit; add future
  // prefs here (validate against a whitelist, same as this one).
  units: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Please sign in again.' });
    const form = await request.formData();
    const temp_unit = form.get('temp_unit') === 'C' ? 'C' : 'F';
    const pb = await superuserPb();
    try {
      await pb.collection('users').update(locals.user.id, { temp_unit });
    } catch (_) {
      return fail(400, { error: 'Could not save your preferences.' });
    }
    await refreshSession(locals);
    throw redirect(303, '/profile');
  },

  // Preferred map app for the itinerary "Navigate" links. Whitelisted, same as
  // the units pref; empty/anything-else reads as Apple Maps in app code.
  maps: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Please sign in again.' });
    const form = await request.formData();
    const map_app = form.get('map_app') === 'google' ? 'google' : 'apple';
    const pb = await superuserPb();
    try {
      await pb.collection('users').update(locals.user.id, { map_app });
    } catch (_) {
      return fail(400, { error: 'Could not save your preferences.' });
    }
    await refreshSession(locals);
    throw redirect(303, '/profile');
  },

  // The tier NEW trips start at. Changing this never touches existing trips —
  // those keep whatever their organizer set.
  tripDefaults: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Please sign in again.' });
    const form = await request.formData();
    const submitted = form.get('default_trip_visibility');
    if (!isVisibility(submitted)) return fail(400, { error: 'Pick a sharing default.' });
    const pb = await superuserPb();
    try {
      await pb.collection('users').update(locals.user.id, { default_trip_visibility: submitted });
    } catch (_) {
      return fail(400, { error: 'Could not save your preferences.' });
    }
    await refreshSession(locals);
    throw redirect(303, '/profile');
  }
};
