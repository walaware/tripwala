// Batch-import past trips from a Notion "Markdown & CSV" export into tripwala.
//
//   node scripts/import-notion.mjs --dir <export-dir>            # dry run (default)
//   node scripts/import-notion.mjs --dir <export-dir> --apply    # write to PocketBase
//   node scripts/import-notion.mjs --dir <export-dir> --out previews/   # where dry-run JSON lands
//   node scripts/import-notion.mjs --dir <export-dir> --limit 3  # first N rows only
//
// Dry run (the default, and what you should look at first) parses the export and
// writes one JSON preview per trip plus a summary — nothing touches PocketBase.
// --apply upserts: trips are keyed on (import_source='notion', external_id=<Notion
// page id>), so re-running reconciles instead of duplicating. PB connection +
// superuser creds match the SvelteKit server (PB_URL, PB_SUPERUSER_*), defaulting
// to the local dev stack on :8090.
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import PocketBase from 'pocketbase';
import { buildBundle } from './lib/notion-parse.mjs';
import { generateSlug } from '../src/lib/server/slug.js';
import { generateOwnerToken } from '../src/lib/server/tokens.js';

const args = parseArgs(process.argv.slice(2));
if (!args.dir && !args.bundles) {
  console.error('Usage: node scripts/import-notion.mjs (--dir <export-dir> | --bundles <file.json>) [--apply] [--out <dir>] [--limit N]');
  process.exit(1);
}

const DEMO_EMAIL = 'demo@tripwala.local';
const DEMO_PASSWORD = 'demotripwala123';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const toPb = (ymd) => (ymd ? `${ymd} 00:00:00.000Z` : '');

// Either parse a raw Notion export (--dir) or load pre-curated bundles (--bundles).
// Curated bundles are hand-structured trips that skip the heuristic parser but
// flow through the same idempotent upsert.
const raw = args.bundles
  ? JSON.parse(await readFile(args.bundles, 'utf8'))
  : await loadBundles(args.dir, args.limit);
const bundles = (args.limit ? raw.slice(0, args.limit) : raw).map((b) => ({
  itinerary: [], warnings: [], photo_album_url: '', location: '', description: '',
  trip_type: 'other', status: 'completed', ...b
}));
console.log(`Loaded ${bundles.length} trip(s) from ${args.bundles || args.dir}\n`);
for (const b of bundles) {
  const flag = b.warnings.length ? `  ⚠ ${b.warnings.join('; ')}` : '';
  console.log(`• ${b.name}  [${b.start_date || '????'}→${b.end_date || '?'}]  ${b.itinerary.length} item(s)${flag}`);
}

if (!args.apply) {
  const out = args.out || (args.dir ? join(args.dir, '_previews') : 'import-previews');
  await mkdir(out, { recursive: true });
  for (const b of bundles) {
    await writeFile(join(out, `${norm(b.name) || b.externalId}.json`), JSON.stringify(b, null, 2));
  }
  console.log(`\nDry run — wrote ${bundles.length} preview(s) to ${out}`);
  console.log('Review them, then re-run with --apply to write to PocketBase.');
  process.exit(0);
}

await apply(bundles);

// ── apply ───────────────────────────────────────────────────────────────────
async function apply(bundles) {
  const pb = new PocketBase(process.env.PB_URL || 'http://127.0.0.1:8090');
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(
    process.env.PB_SUPERUSER_EMAIL || 'admin@tripwala.local',
    process.env.PB_SUPERUSER_PASSWORD || 'tripwalaadmin123'
  );
  const me = await resolveOwner(pb);
  console.log(`\nApplying as owner: ${me.name || me.email} (${me.id})`);

  let created = 0, updated = 0;
  for (const b of bundles) {
    const existing = await findExisting(pb, b.externalId);
    const data = {
      name: b.name, location: b.location,
      start_date: toPb(b.start_date), end_date: toPb(b.end_date),
      description: b.description, trip_type: b.trip_type, status: b.status,
      photo_album_url: b.photo_album_url, import_source: 'notion', external_id: b.externalId
    };
    let trip;
    if (existing) {
      trip = await pb.collection('trips').update(existing.id, data);
      await wipeItinerary(pb, trip.id);
      updated++;
    } else {
      trip = await createTrip(pb, data, b.name, me.id);
      await ensureOwnerParticipant(pb, trip.id, me);
      created++;
    }
    let order = 0;
    for (const it of b.itinerary) {
      await pb.collection('itinerary_items').create({
        trip: trip.id, date: toPb(it.date), label: it.label,
        time: it.time, sort_order: it.sort_order ?? order++, kind: it.kind || 'fixed'
      });
    }
    console.log(`  ${existing ? 'updated' : 'created'}  ${b.name}  (${b.itinerary.length} items)`);
  }
  console.log(`\nDone. ${created} created, ${updated} updated.`);
}

async function findExisting(pb, externalId) {
  try {
    return await pb.collection('trips').getFirstListItem(
      pb.filter('import_source = {:s} && external_id = {:e}', { s: 'notion', e: externalId })
    );
  } catch { return null; }
}

async function wipeItinerary(pb, tripId) {
  const items = await pb.collection('itinerary_items').getFullList({
    filter: pb.filter('trip = {:t}', { t: tripId })
  });
  for (const it of items) await pb.collection('itinerary_items').delete(it.id);
}

async function createTrip(pb, data, name, ownerId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await pb.collection('trips').create({
        ...data,
        share_token: generateSlug(name, attempt),
        owner_token: generateOwnerToken(),
        created_by: ownerId
      });
    } catch (e) {
      if (attempt < 4 && /share_token|unique/i.test(String(e?.message))) continue;
      throw e;
    }
  }
}

async function ensureOwnerParticipant(pb, tripId, me) {
  await pb.collection('participants').create({
    trip: tripId, display_name: me.name || me.email, client_id: randomUUID(),
    user: me.id, role: 'organizer', rsvp_status: 'going'
  });
}

async function resolveOwner(pb) {
  const users = await pb.collection('users').getFullList({ sort: '-created' });
  // Pin the owner explicitly (IMPORT_OWNER_EMAIL) — essential on a SHARED instance
  // where "most recent user" could be someone else. Falls back to newest non-demo.
  const pinned = String(process.env.IMPORT_OWNER_EMAIL || '').trim().toLowerCase();
  if (pinned) {
    const owner = users.find((u) => String(u.email || '').toLowerCase() === pinned);
    if (!owner) throw new Error(`IMPORT_OWNER_EMAIL=${pinned} not found among ${users.length} users`);
    return owner;
  }
  let me = users.find((u) => u.email !== DEMO_EMAIL) || users.find((u) => u.email === DEMO_EMAIL);
  if (!me) {
    me = await pb.collection('users').create({
      email: DEMO_EMAIL, password: DEMO_PASSWORD, passwordConfirm: DEMO_PASSWORD,
      name: 'Sam (demo)', verified: true
    });
    console.log(`No user found — created demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }
  return me;
}

// ── export loading ────────────────────────────────────────────────────────────
async function loadBundles(dir, limit) {
  const files = await walk(dir);
  const csvs = files.filter((f) => extname(f).toLowerCase() === '.csv');
  if (!csvs.length) throw new Error(`No .csv found under ${dir} — is this a Notion "Markdown & CSV" export?`);
  // Notion writes both "<DB>.csv" and "<DB>_all.csv"; the _all variant has every row.
  const csvPath = csvs.find((f) => /_all\.csv$/i.test(f)) || csvs.sort((a, b) => a.length - b.length)[0];
  const { parseCsv } = await import('./lib/notion-parse.mjs');
  const { rows } = parseCsv(await readFile(csvPath, 'utf8'));

  // Map normalized page title → { path, externalId } from the .md filenames.
  const pages = new Map();
  for (const f of files) {
    if (extname(f).toLowerCase() !== '.md') continue;
    const base = basename(f, '.md');
    const m = base.match(/^(.*?)[ ]+([0-9a-f]{32})$/i);
    const title = m ? m[1] : base;
    const externalId = m ? m[2] : '';
    pages.set(norm(title), { path: f, externalId });
  }

  const picked = limit ? rows.slice(0, limit) : rows;
  const bundles = [];
  for (const row of picked) {
    const name = row.Name || row.Title || Object.values(row)[0] || '';
    const page = pages.get(norm(name));
    const markdown = page ? await readFile(page.path, 'utf8') : '';
    const externalId = page?.externalId || `slug:${norm(name)}`;
    bundles.push(buildBundle({ row, markdown, externalId }));
  }
  return bundles;
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function parseArgs(argv) {
  const a = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--apply') a.apply = true;
    else if (k === '--dir') a.dir = argv[++i];
    else if (k === '--bundles') a.bundles = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--limit') a.limit = parseInt(argv[++i], 10);
  }
  return a;
}
