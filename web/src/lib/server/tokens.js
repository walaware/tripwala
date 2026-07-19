import { randomBytes } from 'node:crypto';

// URL-safe random token for the owner/edit capability. base64url yields chars in
// [A-Za-z0-9_-], matching the field pattern; 24 bytes ≈ 192 bits of entropy.
// (The share token is now a friendly slug — see slug.js.)

/** Owner/edit token (held only by the creator). */
export function generateOwnerToken() {
  return randomBytes(24).toString('base64url'); // 32 chars
}

/**
 * Invite token — the capability to JOIN a trip, distinct from the friendly
 * share slug (which now only grants a view-only teaser). Shared by organizers as
 * the "Invite link" (`/{share_token}?invite={invite_token}`). Random, not a slug,
 * so possessing the trip's page URL never implies the ability to join.
 */
export function generateInviteToken() {
  return randomBytes(18).toString('base64url'); // 24 chars ≈ 144 bits
}
