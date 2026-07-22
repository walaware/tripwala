// Per-user read confinement for the personal-key API. Every read on /api/x/v1/*
// is limited to the trips the key's owner is an ACTIVE member of — the same set
// they'd see logged into the UI. A `pending` (unapproved) link-join can't see a
// trip in the UI, so it's excluded here too. A missing filter here would be a
// cross-user data leak (the token is the only gate on the public edge), so these
// helpers are the one place the confinement is expressed.

/**
 * The user's ACTIVE participant rows (excludes unapproved `pending` joins).
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @returns {Promise<any[]>}
 */
export async function activeMemberships(pb, userId) {
  if (!userId) return [];
  const rows = await pb
    .collection('participants')
    .getFullList({ filter: pb.filter('user = {:u}', { u: userId }) });
  return rows.filter((p) => p.status !== 'pending');
}

/**
 * The trip ids the user is an active member of.
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function activeTripIds(pb, userId) {
  const rows = await activeMemberships(pb, userId);
  return [...new Set(rows.map((p) => p.trip))];
}

/**
 * A PocketBase OR-filter matching `field` against any of `ids`, safely bound.
 * Returns null when `ids` is empty (caller should short-circuit to no rows).
 *
 * @param {import('pocketbase').default} pb superuser client
 * @param {string} field
 * @param {string[]} ids
 * @returns {string | null}
 */
export function anyOf(pb, field, ids) {
  if (!ids.length) return null;
  return pb.filter(
    ids.map((_, i) => `${field} = {:v${i}}`).join(' || '),
    Object.fromEntries(ids.map((id, i) => [`v${i}`, id]))
  );
}
