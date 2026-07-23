import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBearer, PERSONAL_KEY_SCOPES, mintPersonalKey } from './apiKeys.js';

// A minimal fake PocketBase superuser client that records the create payload and
// short-circuits the impersonate/update dance, so we can assert what mint sends.
function fakePb() {
  /** @type {{ create: any }} */
  const calls = { create: null };
  const collection = () => ({
    /** @param {any} data */
    create: async (data) => {
      calls.create = data;
      return { id: 'rec_1', ...data };
    },
    impersonate: async () => ({ authStore: { token: 'a.b.c' } }),
    update: async () => ({})
  });
  return { calls, collection };
}

test('extractBearer strips a Bearer prefix (case-insensitive)', () => {
  assert.equal(extractBearer('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearer('bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(extractBearer('BEARER   abc.def.ghi'), 'abc.def.ghi');
});

test('extractBearer tolerates a bare token', () => {
  assert.equal(extractBearer('abc.def.ghi'), 'abc.def.ghi');
});

test('extractBearer returns empty for absent/blank headers', () => {
  assert.equal(extractBearer(null), '');
  assert.equal(extractBearer(undefined), '');
  assert.equal(extractBearer('   '), '');
  assert.equal(extractBearer('Bearer   '), '');
});

test('PERSONAL_KEY_SCOPES is the full read+write, user-confined grant (never "*")', () => {
  assert.deepEqual(PERSONAL_KEY_SCOPES, [
    'trips:read',
    'trip_ideas:read',
    'participants:read',
    'invitations:read',
    'trip_ideas:write',
    'trips:write'
  ]);
  assert.ok(!PERSONAL_KEY_SCOPES.includes('*'));
});

test('mintPersonalKey sends a password within PocketBase’s 70-char limit', async () => {
  // Regression: two raw UUIDs (72 chars) overflowed the password field and made
  // every create 400 with "Failed to create record." (see randomSecret cap).
  const pb = fakePb();
  await mintPersonalKey(/** @type {any} */ (pb), { id: 'user_abc' }, 'my key');
  assert.ok(pb.calls.create, 'create was called');
  assert.ok(pb.calls.create.password.length <= 70, `password ${pb.calls.create.password.length} > 70`);
  assert.equal(pb.calls.create.password, pb.calls.create.passwordConfirm);
  assert.equal(pb.calls.create.user, 'user_abc');
  assert.deepEqual(pb.calls.create.scopes, PERSONAL_KEY_SCOPES);
});
