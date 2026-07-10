// Render — and optionally really send — the tripwala invite email.
//
// The app's mailer reads config through SvelteKit's $env/dynamic/private, which
// only exists inside the server build, so this script talks to nodemailer
// directly using the SAME env vars and the SAME renderEmail() layout. What you
// see here is what recipients get.
//
//   # write the HTML to a file and open it in a browser
//   pnpm email:preview
//
//   # actually send it (needs SMTP_* configured, e.g. via ../.env)
//   pnpm email:preview you@example.com
//
// Sending is the only way to check the parts a local render can't show you:
// SPF/DKIM alignment, whether the From domain is verified, and how the inbox
// renders it. Do this once after wiring up Resend.
import { writeFileSync } from 'node:fs';
import { renderEmail, esc } from '../src/lib/server/emailLayout.js';

const SAMPLE = {
  tripName: 'Mendocino Coast Camping',
  inviterName: 'Sam',
  inviteUrl: 'https://tripwala.enzoiwith.us/mendocino-mossy-otter-pine'
};

const html = renderEmail({
  eyebrow: "You're invited 🎒",
  title: SAMPLE.tripName,
  preheader: `${SAMPLE.inviterName} invited you to join ${SAMPLE.tripName}.`,
  bodyHtml: `<b>${esc(SAMPLE.inviterName)}</b> invited you to join this trip on tripwala. Sign in with Google and you're in — no password to set up.`,
  ctaLabel: 'Join the trip',
  ctaUrl: SAMPLE.inviteUrl
});

const out = '/tmp/tripwala-invite-preview.html';
writeFileSync(out, html);
console.log(`Rendered → ${out}`);

const to = process.argv[2];
if (!to) {
  console.log('Pass an address to send a real test: pnpm email:preview you@example.com');
  process.exit(0);
}

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('\nSMTP_HOST / SMTP_USER / SMTP_PASS are not set — nothing to send with.');
  console.error('Populate ../.env (see .env.example) and retry.');
  process.exit(1);
}

const nodemailer = (await import('nodemailer')).default;
const port = Number(SMTP_PORT || 587);
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

// verify() surfaces auth/TLS problems as a clear error instead of a silent
// queue-and-drop later.
await transport.verify();
console.log(`Connected to ${SMTP_HOST}:${port} as ${SMTP_USER}.`);

const info = await transport.sendMail({
  from: SMTP_FROM || `tripwala <${SMTP_USER}>`,
  to,
  subject: `${SAMPLE.inviterName} invited you to ${SAMPLE.tripName} on tripwala`,
  text: `${SAMPLE.inviterName} invited you to join "${SAMPLE.tripName}" on tripwala.\n\nOpen the trip to join:\n${SAMPLE.inviteUrl}\n\ntripwala — one link, everyone's in.`,
  html
});

console.log(`Sent to ${to} (id ${info.messageId}).`);
console.log('Check the inbox AND the spam folder — landing in spam means SPF/DKIM need attention.');
