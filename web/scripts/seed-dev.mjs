// Dev seed: populate a local stack with a few varied trips so the dashboard and
// views aren't empty. Idempotent by share_token — safe to re-run.
//
// Talks to PocketBase DIRECTLY on :8090, not through Caddy — Caddy exposes only
// /api/files/*, so collection and admin endpoints 404 through it. Publish the
// port with the dev override first:
//   docker compose -f compose.yml -f compose.dev.yml up -d pocketbase
//
//   pnpm seed:dev                 # talks to http://127.0.0.1:8090
//   SEED_PB_URL=… pnpm seed:dev   # custom origin
//
// Trips are attached to the most recently signed-in user (so they show in YOUR
// dashboard); if nobody has signed in yet, a demo account is created and its
// login is printed. Superuser creds come from --env-file (../.env) or the
// compose defaults.
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

const DEMO_EMAIL = 'demo@tripwala.local';
const DEMO_PASSWORD = 'demotripwala123';

const pb = new PocketBase(process.env.SEED_PB_URL || 'http://127.0.0.1:8090');
pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(
  process.env.PB_SUPERUSER_EMAIL || 'admin@tripwala.local',
  process.env.PB_SUPERUSER_PASSWORD || 'tripwalaadmin123'
);

// Prefer a real signed-in user; otherwise create/reuse the demo account.
const users = await pb.collection('users').getFullList({ sort: '-created' });
let me = users.find((u) => u.email !== DEMO_EMAIL);
if (!me) {
  me = users.find((u) => u.email === DEMO_EMAIL);
  if (!me) {
    me = await pb.collection('users').create({
      email: DEMO_EMAIL, password: DEMO_PASSWORD, passwordConfirm: DEMO_PASSWORD,
      name: 'Sam (demo)', verified: true
    });
  }
  console.log(`No signed-in user found — using demo account. Log in with: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
const myName = me.name || me.email;
console.log(`Seeding trips for: ${myName} (${me.id})`);

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const toPb = (s) => `${s} 00:00:00.000Z`;
const create = (coll, data) => pb.collection(coll).create(data);
const part = (tripId, name, extra = {}) =>
  create('participants', { trip: tripId, display_name: name, client_id: randomUUID(), ...extra });
async function exists(token) {
  try { await pb.collection('trips').getFirstListItem(pb.filter('share_token = {:t}', { t: token })); return true; }
  catch { return false; }
}

async function seedConfirmed() {
  const token = 'tahoe-ski-weekend-demo';
  if (await exists(token)) return console.log('skip', token);
  const s = addDays(21), e = addDays(23);
  const trip = await create('trips', {
    name: 'Tahoe Ski Weekend', location: 'Palisades Tahoe, CA',
    start_date: toPb(ymd(s)), end_date: toPb(ymd(e)),
    description: '<p>Three days on the mountain. Cabin booked — bring your own gear or rent in town.</p>',
    share_token: token, owner_token: 'owner-' + randomUUID(), created_by: me.id, status: 'confirmed',
    trip_type: 'ski', expense_link: 'https://spliit.app'
  });
  const meP = await part(trip.id, myName, { user: me.id, role: 'organizer', rsvp_status: 'going' });
  const alex = await part(trip.id, 'Alex Rivera', { rsvp_status: 'going' });
  const priya = await part(trip.id, 'Priya N', { rsvp_status: 'going' });
  await part(trip.id, 'Jordan', { rsvp_status: 'maybe' });
  const cabin = await create('gear_items', { trip: trip.id, name: 'Cabin booking', category: 'Lodging', qty_needed: 1, created_by: meP.id });
  await create('gear_claims', { gear_item: cabin.id, participant: meP.id, qty_claimed: 1 });
  const chains = await create('gear_items', { trip: trip.id, name: 'Tire chains', category: 'Transport', qty_needed: 2, created_by: alex.id });
  await create('gear_claims', { gear_item: chains.id, participant: alex.id, qty_claimed: 1 });
  await create('gear_items', { trip: trip.id, name: 'First aid kit', category: 'Safety', qty_needed: 1, created_by: meP.id });
  const slots = [['Fri Dinner', ymd(s), 0], ['Sat Breakfast', ymd(addDays(22)), 1], ['Sat Dinner', ymd(addDays(22)), 2], ['Sun Breakfast', ymd(e), 3]];
  let first;
  for (const [label, d, so] of slots) { const m = await create('meal_slots', { trip: trip.id, label, date: toPb(d), sort_order: so }); if (!first) first = m; }
  await create('meal_signups', { meal_slot: first.id, participant: priya.id, dish_note: 'Big pot of chili' });
  await create('packing_items', { trip: trip.id, participant: meP.id, label: 'Goggles', is_shared: false, checked: true });
  await create('packing_items', { trip: trip.id, label: 'Bluetooth speaker', is_shared: true, checked: false });
  console.log('created', token);
}

async function seedPlanning() {
  const token = 'desert-backpacking-demo';
  if (await exists(token)) return console.log('skip', token);
  const trip = await create('trips', {
    name: 'Desert Backpacking', location: '',
    description: "<p>Spring trip idea — let's find dates that work and pick a route.</p>",
    share_token: token, owner_token: 'owner-' + randomUUID(), created_by: me.id, status: 'planning', trip_type: 'backpacking'
  });
  const d1 = ymd(addDays(40)), d2 = ymd(addDays(41)), d3 = ymd(addDays(47)), d4 = ymd(addDays(48));
  const meP = await part(trip.id, myName, { user: me.id, role: 'organizer', available_dates: [d1, d2, d3, d4] });
  const chris = await part(trip.id, 'Chris', { available_dates: [d1, d2] });
  const dana = await part(trip.id, 'Dana', { available_dates: [d3, d4] });
  const optA = await create('date_options', { trip: trip.id, start_date: toPb(d1), end_date: toPb(d2) });
  const optB = await create('date_options', { trip: trip.id, start_date: toPb(d3), end_date: toPb(d4) });
  await create('date_votes', { date_option: optA.id, participant: meP.id, vote: 'yes' });
  await create('date_votes', { date_option: optA.id, participant: chris.id, vote: 'yes' });
  await create('date_votes', { date_option: optA.id, participant: dana.id, vote: 'maybe' });
  await create('date_votes', { date_option: optB.id, participant: meP.id, vote: 'maybe' });
  await create('date_votes', { date_option: optB.id, participant: dana.id, vote: 'yes' });
  const ideaA = await create('location_ideas', { trip: trip.id, label: 'Joshua Tree NP', url: 'https://www.nps.gov/jotr', participant: meP.id });
  const ideaB = await create('location_ideas', { trip: trip.id, label: 'Death Valley — Cottonwood Canyon', url: '', participant: chris.id });
  await create('location_votes', { location_idea: ideaA.id, participant: meP.id });
  await create('location_votes', { location_idea: ideaA.id, participant: dana.id });
  await create('location_votes', { location_idea: ideaB.id, participant: chris.id });
  console.log('created', token);
}

async function seedCompleted() {
  const token = 'big-sur-road-trip-demo';
  if (await exists(token)) return console.log('skip', token);
  const s = addDays(-30), e = addDays(-27);
  const trip = await create('trips', {
    name: 'Big Sur Road Trip', location: 'Big Sur, CA',
    start_date: toPb(ymd(s)), end_date: toPb(ymd(e)),
    description: '<p>Coastal drive down Highway 1. Already happened — good times.</p>',
    share_token: token, owner_token: 'owner-' + randomUUID(), created_by: me.id, status: 'completed', trip_type: 'road_trip'
  });
  const meP = await part(trip.id, myName, { user: me.id, role: 'organizer', rsvp_status: 'going' });
  await part(trip.id, 'Taylor', { rsvp_status: 'going' });
  await part(trip.id, 'Morgan', { rsvp_status: 'going' });
  const cooler = await create('gear_items', { trip: trip.id, name: 'Cooler', category: 'Cooking', qty_needed: 1, created_by: meP.id });
  await create('gear_claims', { gear_item: cooler.id, participant: meP.id, qty_claimed: 1 });
  console.log('created', token);
}

await seedConfirmed();
await seedPlanning();
await seedCompleted();
console.log('Done.');
