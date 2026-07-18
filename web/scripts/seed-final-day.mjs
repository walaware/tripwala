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

// Each entry is a `fixed` schedule item: a short `label` (the one-line title),
// `place` (a free-text directions target both Apple + Google accept — see
// $lib/maps.js), and a longer `note` (the descriptive prose, shown wrapped
// beneath the title). Keyed by `time` for idempotent upserts.
const items = [
  {
    time: '12:45–2:45pm',
    label: 'Picnic lunch + dog downtime',
    place: 'Lake Mary, Mammoth Lakes, CA',
    note: 'Drive up into the Lake Mary / Twin Lakes basin, grab a shaded pullout, cook lunch by the water. This is your buffer block — nap the dogs, no clock pressure.'
  },
  {
    time: 'Before leaving',
    label: 'Top off gas in Mammoth',
    place: 'gas station Mammoth Lakes, CA',
    note: 'Food’s handled by the kitchen; fuel is the one gap. Nothing reliable between Lee Vining and Yosemite’s west side.'
  },
  {
    time: '~3:30pm',
    label: 'Departure — 395 north to Lee Vining',
    place: 'Lee Vining, CA',
    note: '~35 min. Last fuel there if you skipped Mammoth.'
  },
  {
    time: '~4:15pm',
    label: 'Ellery / Tioga Lake',
    place: 'Tioga Lake, CA',
    note: 'Just east of the gate. Outside the park, so looser dog rules — good final coffee / leg-stretch before the crossing.'
  },
  {
    time: '4:30–6:15pm',
    label: 'Tioga crossing',
    place: 'Olmsted Point, Yosemite National Park',
    note: 'Leashed photo pullouts only (dogs banned from all Yosemite trails): Tioga Lake, Olmsted Point, Tenaya Lake. The pullouts are the show.'
  },
  {
    time: '~6:30pm',
    label: 'Crane Flat (west gate)',
    place: 'Crane Flat, Yosemite National Park',
    note: 'Then ~4 hr → home ~10:30–11:30pm.'
  }
];

// Upsert by (trip, date, time): update a matching row in place (so re-running
// after the label/note split rewrites the earlier long-label seed), else create.
const existing = await pb.collection('itinerary_items').getFullList({
  filter: pb.filter('trip = {:t} && date = {:d}', { t: trip.id, d: pbDate })
});
const byTime = new Map(existing.map((r) => [r.time, r]));

let order = existing.length;
for (const it of items) {
  const fields = { time: it.time, label: it.label, place: it.place, note: it.note, kind: 'fixed' };
  const match = byTime.get(it.time);
  if (match) {
    await pb.collection('itinerary_items').update(match.id, fields);
    console.log('updated:', it.time, '→', it.label);
  } else {
    await pb.collection('itinerary_items').create({ trip: trip.id, date: pbDate, sort_order: order++, ...fields });
    console.log('created:', it.time, '→', it.label);
  }
}
console.log('Done.');
