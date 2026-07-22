import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBearer, PERSONAL_KEY_SCOPES } from './apiKeys.js';

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
