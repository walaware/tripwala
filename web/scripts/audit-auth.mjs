// Pre-flight for the Google-only switch: report any account that could NOT sign
// in once email/password login is removed.
//
// tripwala authenticates users two ways today. After the switch, only a linked
// Google identity works — a password-only account becomes unreachable, and the
// person has no self-serve way back in. Run this against PRODUCTION before
// deploying that change.
//
// Talks to PocketBase DIRECTLY, never through Caddy (which exposes only
// /api/files/*). Locally that means the dev override's published :8090; in prod,
// an SSH tunnel to the host: ssh -L 8090:127.0.0.1:8090 <host>
//
//   # local stack
//   pnpm audit:auth
//
//   # production, over a tunnel (superuser creds from env / 1Password)
//   AUDIT_PB_URL=http://127.0.0.1:8090 \
//   PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… pnpm audit:auth
//
// Exit code 0 = every account has Google linked (safe to deploy).
// Exit code 1 = at least one account is password-only (see the list; migrate or
//               warn those people first).
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.AUDIT_PB_URL || process.env.PB_URL || 'http://127.0.0.1:8090');
pb.autoCancellation(false);

await pb
  .collection('_superusers')
  .authWithPassword(
    process.env.PB_SUPERUSER_EMAIL || 'admin@tripwala.local',
    process.env.PB_SUPERUSER_PASSWORD || 'tripwalaadmin123'
  );

const users = await pb.collection('users').getFullList({ sort: 'created' });
// PocketBase records each linked OAuth identity as a row in the system
// _externalAuths collection, keyed by the user's record id.
const external = await pb.collection('_externalAuths').getFullList();

const googleLinked = new Set(
  external.filter((e) => e.provider === 'google').map((e) => e.recordRef)
);

const stranded = users.filter((u) => !googleLinked.has(u.id));

console.log(`${users.length} account(s); ${googleLinked.size} with Google linked.\n`);

if (!stranded.length) {
  console.log('✓ Every account can sign in with Google. Safe to remove password login.');
  process.exit(0);
}

console.log(`✗ ${stranded.length} account(s) would be LOCKED OUT by a Google-only switch:\n`);
for (const u of stranded) {
  console.log(`  ${u.email.padEnd(36)} created ${String(u.created).slice(0, 10)}  id=${u.id}`);
}
console.log(`
Each of these signed up with a password and has never used Google. Options:
  1. Ask them to sign in with Google using the SAME email — PocketBase links the
     identity to the existing account automatically, preserving their trips.
  2. Delete the account if it is a leftover test user.
Re-run this until it reports clean, then deploy.`);
process.exit(1);
