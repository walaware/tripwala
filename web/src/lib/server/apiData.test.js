import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anyOf } from './apiData.js';

// A stand-in for pb.filter: records the template + params so we can assert the
// query is parameter-bound (not string-concatenated ids → no injection). anyOf
// only touches `.filter`, so a partial stub (cast to the client type) is enough.
function fakePb() {
  const calls = /** @type {Array<{ tmpl: string, params: Record<string, unknown> }>} */ ([]);
  const pb = {
    calls,
    /** @param {string} tmpl @param {Record<string, unknown>} params */
    filter(tmpl, params) {
      calls.push({ tmpl, params });
      return { tmpl, params };
    }
  };
  return pb;
}

test('anyOf returns null for an empty id list (caller short-circuits to no rows)', () => {
  const pb = fakePb();
  assert.equal(anyOf(/** @type {any} */ (pb), 'trip', []), null);
  assert.equal(pb.calls.length, 0);
});

test('anyOf builds a bound OR filter over the ids', () => {
  const pb = fakePb();
  const out = /** @type {any} */ (anyOf(/** @type {any} */ (pb), 'trip', ['a', 'b', 'c']));
  assert.equal(pb.calls.length, 1);
  assert.equal(out.tmpl, 'trip = {:v0} || trip = {:v1} || trip = {:v2}');
  assert.deepEqual(out.params, { v0: 'a', v1: 'b', v2: 'c' });
});

test('anyOf binds ids as params — never concatenated into the template', () => {
  const pb = fakePb();
  const evil = 'x" || 1=1 --';
  const out = /** @type {any} */ (anyOf(/** @type {any} */ (pb), 'id', [evil]));
  // The dangerous value only appears in params, never in the template text.
  assert.ok(!out.tmpl.includes(evil));
  assert.equal(out.params.v0, evil);
});
