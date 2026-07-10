// Outbound email via SMTP (nodemailer). Provider-agnostic — any SMTP relay works
// by setting env. Read at RUNTIME via $env/dynamic/private so the homelab can
// supply creds through compose without a rebuild. When unset, email invites are
// simply disabled (the UI hides the field and the action refuses), so the app
// runs fine with no mail config.
//
//   SMTP_HOST   e.g. smtp.resend.com
//   SMTP_PORT   587 (STARTTLS) or 465 (implicit TLS); default 587
//   SMTP_USER   the SMTP username (for Resend this is the literal "resend")
//   SMTP_PASS   the SMTP password (for Resend, an API key: re_…)
//   SMTP_FROM   "Name <addr>" on a verified domain; defaults to "tripwala <SMTP_USER>"
//
// Deliverability note: SMTP_FROM must be a domain you've verified with the
// provider (SPF + DKIM), or mail lands in spam. See .env.example.
//
// Every message renders through renderEmail() so they share one look.

import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import { renderEmail, esc } from './emailLayout.js';

/** Whether outbound email is configured (host + creds present). */
export function isMailConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/** @type {import('nodemailer').Transporter | null} */
let cached = null;
function transport() {
  if (!cached) {
    const port = Number(env.SMTP_PORT || 587);
    cached = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  }
  return cached;
}

/**
 * Send a trip invite email. The body is fixed (trip name + inviter + link) — no
 * free-form, user-injected content, to keep the endpoint from being a spam relay.
 *
 * @param {{ to: string, tripName: string, inviterName: string, inviteUrl: string }} o
 */
export async function sendInviteEmail({ to, tripName, inviterName, inviteUrl }) {
  if (!isMailConfigured()) throw new Error('Email is not configured');
  const from = env.SMTP_FROM || `tripwala <${env.SMTP_USER}>`;
  const subject = `${inviterName} invited you to ${tripName} on tripwala`;

  // Always send text alongside HTML: it's what plain-text clients show, and a
  // missing text part is itself a spam signal.
  const text =
    `${inviterName} invited you to join "${tripName}" on tripwala.\n\n` +
    `Open the trip to join:\n${inviteUrl}\n\n` +
    `tripwala — one link, everyone's in.`;

  const html = renderEmail({
    eyebrow: "You're invited 🎒",
    title: tripName,
    preheader: `${inviterName} invited you to join ${tripName}.`,
    bodyHtml: `<b>${esc(inviterName)}</b> invited you to join this trip on tripwala. Sign in with Google and you're in — no password to set up.`,
    ctaLabel: 'Join the trip',
    ctaUrl: inviteUrl
  });

  await transport().sendMail({ from, to, subject, text, html });
}
