import { redirect } from '@sveltejs/kit';
import { superuserPb } from '$lib/server/pocketbase.js';
import { loadUserBookings, isPending, isRecoupable } from '$lib/server/bookings.js';

// Cross-trip booking reminders (#4). Aggregates every booking across the trips
// the signed-in user belongs to, and splits them into the two questions the
// tracker exists to answer:
//   • "What still needs booking?"  → status = planning
//   • "What can I still get money back on?" → refundable + a future deadline,
//     sorted by how soon the cancel window closes.

/** Local YYYY-MM-DD for "today" (server clock) — the deadline comparison base. */
function todayIso() {
  const n = new Date();
  const p = (/** @type {number} */ v) => String(v).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  if (!locals.user) throw redirect(303, '/login?next=/bookings');
  const pb = await superuserPb();
  const today = todayIso();

  const all = await loadUserBookings(pb, locals.user.id);

  const pending = all.filter(isPending);
  const recoupable = all
    .filter((b) => isRecoupable(b, today))
    .sort((a, b) => {
      // Soonest deadline first; open-ended (no deadline) trails.
      if (a.refund_deadline && b.refund_deadline) return a.refund_deadline.localeCompare(b.refund_deadline);
      if (a.refund_deadline) return -1;
      if (b.refund_deadline) return 1;
      return 0;
    });

  return { pending, recoupable, total: all.length, today };
}
