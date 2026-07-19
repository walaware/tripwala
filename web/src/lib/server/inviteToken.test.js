// Unit tests for the invite-capability gate (#2): the bare share slug is
// view-only; only the matching invite_token unlocks joining. Pure function, no
// PocketBase needed. Run: `pnpm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteTokenValid } from './membership.js';
import { generateInviteToken } from './tokens.js';

test('inviteTokenValid: matching token unlocks join', () => {
  const trip = { invite_token: 'abc123_-XYZ' };
  assert.equal(inviteTokenValid(trip, 'abc123_-XYZ'), true);
});

test('inviteTokenValid: wrong / empty token is rejected', () => {
  const trip = { invite_token: 'abc123' };
  assert.equal(inviteTokenValid(trip, 'nope'), false);
  assert.equal(inviteTokenValid(trip, ''), false);
  assert.equal(inviteTokenValid(trip, null), false);
  assert.equal(inviteTokenValid(trip, undefined), false);
});

test('inviteTokenValid: a trip with no token can never be joined by a blank token', () => {
  assert.equal(inviteTokenValid({ invite_token: '' }, ''), false);
  assert.equal(inviteTokenValid({}, ''), false);
  assert.equal(inviteTokenValid(null, ''), false);
});

test('inviteTokenValid: surrounding whitespace is trimmed on both sides', () => {
  assert.equal(inviteTokenValid({ invite_token: 'tok' }, '  tok  '), true);
});

test('generateInviteToken: url-safe and unguessable-length', () => {
  const t = generateInviteToken();
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.ok(t.length >= 20, `expected a long token, got ${t.length} chars`);
  assert.notEqual(generateInviteToken(), generateInviteToken());
});
