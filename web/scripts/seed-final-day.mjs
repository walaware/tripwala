// Seed the final-day itinerary (Mammoth → Yosemite → home) onto an existing trip,
// with a map `place` on every entry so the Navigate button deep-links into the
// viewer's map app. Idempotent by (trip, date, label) — safe to re-run.
//
// Talks to PocketBase DIRECTLY (not through Caddy, which exposes only
// /api/files/*). Superuser creds come from --env-file (../.env) or the compose
// defaults, same as seed-dev.mjs.
//
// Required:
//   SEED_SHARE_TOKEN   the trip's share_token (the bit after tripwala.…/)
//   SEED_ITIN_DATE     the day to attach entries to, YYYY-MM-DD
// Optional:
//   SEED_PB_URL        PocketBase origin (default http://127.0.0.1:8090)
//
// Examples:
//   SEED_SHARE_TOKEN=abc123 SEED_ITIN_DATE=2026-07-20 pnpm --dir web exec node scripts/seed-final-day.mjs
//   SEED_PB_URL=http://127.0.0.1:8090 SEED_SHARE_TOKEN=… SEED_ITIN_DATE=… node web/scripts/seed-final-day.mjs
import PocketBase from 'pocketbase';

const SHARE_TOKEN = process.env.SEED_SHARE_TOKEN;
const ITIN_DATE = process.env.SEED_ITIN_DATE;
if (!SHARE_TOKEN || !/^\d{4}-\d{2}-\d{2}$/.test(ITIN_DATE || '')) {
  console.error('Set SEED_SHARE_TOKEN and SEED_ITIN_DATE=YYYY-MM-DD. See the header for usage.');
  process.exit(1);
}

const pb = new PocketBase(process.env.SEED_PB_URL || 'http://127.0.0.1:8090');
pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(
  process.env.PB_SUPERUSER_EMAIL || 'admin@tripwala.local',
  process.env.PB_SUPERUSER_PASSWORD || 'tripwalaadmin123'
);

const trip = await pb
  .collection('trips')
  .getFirstListItem(pb.filter('share_token = {:t}', { t: SHARE_TOKEN }))
  .catch(() => null);
if (!trip) {
  console.error(`No trip with share_token "${SHARE_TOKEN}".`);
  process.exit(1);
}
console.log(`Seeding final-day itinerary onto "${trip.name}" (${trip.id}) for ${ITIN_DATE}`);

const pbDate = `${ITIN_DATE} 00:00:00.000Z`;

// Each entry is a `fixed` schedule item. `place` is a free-text destination that
// both Apple and Google accept as a directions target (see $lib/maps.js).
const items = [
  {
    time: '12:45–2:45pm',
    label: 'Picnic lunch + dog downtime — Lake Mary / Twin Lakes basin. Shaded pullout, cook by the water. Buffer block: nap the dogs, no clock pressure.',
    place: 'Lake Mary, Mammoth Lakes, CA'
  },
  {
    time: 'Before leaving',
    label: 'Top off gas in Mammoth. Nothing reliable between Lee Vining and Yosemite’s west side.',
    place: 'gas station Mammoth Lakes, CA'
  },
  {
    time: '~3:30pm',
    label: 'Departure — 395 north to Lee Vining (~35 min). Last fuel there if you skipped Mammoth.',
    place: 'Lee Vining, CA'
  },
  {
    time: '~4:15pm',
    label: 'Ellery / Tioga Lake (just east of the gate). Outside the park — looser dog rules. Final coffee / leg-stretch before the crossing.',
    place: 'Tioga Lake, CA'
  },
  {
    time: '4:30–6:15pm',
    label: 'Tioga crossing — leashed photo pullouts only (dogs banned from all Yosemite trails): Tioga Lake, Olmsted Point, Tenaya Lake. The pullouts are the show.',
    place: 'Olmsted Point, Yosemite National Park'
  },
  {
    time: '~6:30pm',
    label: 'Crane Flat (west gate), then ~4 hr → home ~10:30–11:30pm.',
    place: 'Crane Flat, Yosemite National Park'
  }
];

// Existing items on this trip+day, to skip re-inserting on re-run.
const existing = await pb.collection('itinerary_items').getFullList({
  filter: pb.filter('trip = {:t} && date = {:d}', { t: trip.id, d: pbDate })
});
const seen = new Set(existing.map((i) => i.label));

let order = existing.length;
for (const it of items) {
  if (seen.has(it.label)) {
    console.log('skip (exists):', it.time);
    continue;
  }
  await pb.collection('itinerary_items').create({
    trip: trip.id,
    date: pbDate,
    time: it.time,
    label: it.label,
    place: it.place,
    kind: 'fixed',
    sort_order: order++
  });
  console.log('created:', it.time, '→', it.place);
}
console.log('Done.');
