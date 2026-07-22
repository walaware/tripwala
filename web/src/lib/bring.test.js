// Characterisation tests for the "what to bring" logic — gear claims and each
// person's bag. Written BEFORE consolidating the gear and packing sections,
// because neither feature had a single test and the consolidation involves a
// data migration. These pin down the behaviour that must survive it.
//
// Run: `pnpm test`

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shapeGear,
  claimQty,
  canTogglePacking,
  myBag,
  splitPacking,
  isShared,
  canRecommend,
  publicListApplies,
  quantitiesApply,
  sortByNeed,
  bringStatus
} from './bring.js';

// ── shapeGear ────────────────────────────────────────────────────────────────

test('shapeGear: an unclaimed item is fully outstanding', () => {
  const [g] = shapeGear([{ id: 'g1', name: 'Stove', qty_needed: 1 }], []);
  assert.equal(g.claimed, 0);
  assert.equal(g.remaining, 1);
  assert.deepEqual(g.claims, []);
});

test('shapeGear: claims subtract from what is needed', () => {
  const [g] = shapeGear(
    [{ id: 'g1', name: 'Tent', qty_needed: 3 }],
    [
      { id: 'c1', gear_item: 'g1', participant: 'p1', qty_claimed: 1 },
      { id: 'c2', gear_item: 'g1', participant: 'p2', qty_claimed: 1 }
    ],
    { p1: 'Sam', p2: 'Alex' }
  );
  assert.equal(g.claimed, 2);
  assert.equal(g.remaining, 1);
  assert.deepEqual(
    g.claims.map((c) => c.participantName),
    ['Sam', 'Alex']
  );
});

test('shapeGear: over-claiming reads as covered, never negative', () => {
  const [g] = shapeGear(
    [{ id: 'g1', name: 'Stove', qty_needed: 1 }],
    [
      { id: 'c1', gear_item: 'g1', participant: 'p1', qty_claimed: 1 },
      { id: 'c2', gear_item: 'g1', participant: 'p2', qty_claimed: 2 }
    ]
  );
  assert.equal(g.claimed, 3);
  assert.equal(g.remaining, 0);
});

test('shapeGear: missing qty_needed and qty_claimed both default to 1', () => {
  const [g] = shapeGear(
    [{ id: 'g1', name: 'Map' }],
    [{ id: 'c1', gear_item: 'g1', participant: 'p1' }]
  );
  assert.equal(g.qty_needed, 1);
  assert.equal(g.claimed, 1);
  assert.equal(g.remaining, 0);
});

test('shapeGear: an unknown claimer degrades to "Someone" rather than blank', () => {
  const [g] = shapeGear(
    [{ id: 'g1', name: 'Rope', qty_needed: 1 }],
    [{ id: 'c1', gear_item: 'g1', participant: 'ghost', qty_claimed: 1 }],
    {}
  );
  assert.equal(g.claims[0].participantName, 'Someone');
});

test('shapeGear: claims for other items never leak across', () => {
  const out = shapeGear(
    [
      { id: 'g1', name: 'Stove', qty_needed: 1 },
      { id: 'g2', name: 'Tent', qty_needed: 1 }
    ],
    [{ id: 'c1', gear_item: 'g2', participant: 'p1', qty_claimed: 1 }]
  );
  assert.equal(out[0].remaining, 1); // stove untouched
  assert.equal(out[1].remaining, 0); // tent covered
});

test('shapeGear: empty trip yields an empty list', () => {
  assert.deepEqual(shapeGear([], []), []);
});

// ── claimQty ─────────────────────────────────────────────────────────────────

test('claimQty: a fresh claim takes everything outstanding', () => {
  assert.equal(claimQty(3, []), 3);
  assert.equal(claimQty(3, [{ qty_claimed: 1 }]), 2);
});

test('claimQty: claiming an already-covered item still takes 1, not 0', () => {
  // "I'll bring a spare" must create a real claim, not a no-op row.
  assert.equal(claimQty(1, [{ qty_claimed: 1 }]), 1);
  assert.equal(claimQty(2, [{ qty_claimed: 5 }]), 1);
});

// ── canTogglePacking ─────────────────────────────────────────────────────────

test('canTogglePacking: you may tick your own item', () => {
  assert.equal(canTogglePacking({ participant: 'me' }, 'me', false), true);
});

test("canTogglePacking: you may not tick someone else's", () => {
  assert.equal(canTogglePacking({ participant: 'them' }, 'me', false), false);
});

test('canTogglePacking: an organizer may tick anyone’s', () => {
  assert.equal(canTogglePacking({ participant: 'them' }, 'me', true), true);
});

test('canTogglePacking: an ownerless row is open to any member', () => {
  assert.equal(canTogglePacking({ participant: null }, 'me', false), true);
  assert.equal(canTogglePacking({}, 'me', false), true);
});

// ── myBag ────────────────────────────────────────────────────────────────────

test('myBag: returns only your items', () => {
  const packing = [
    { id: 'a', participant: 'me' },
    { id: 'b', participant: 'them' },
    { id: 'c', participant: 'me' }
  ];
  assert.deepEqual(
    myBag(packing, 'me').map((p) => p.id),
    ['a', 'c']
  );
});

test("myBag: a signed-out / unclaimed viewer sees nothing, not everyone's", () => {
  const packing = [{ id: 'a', participant: 'them' }];
  assert.deepEqual(myBag(packing, null), []);
  assert.deepEqual(myBag(packing, undefined), []);
});

test('myBag: organizer recommendations are not your items', () => {
  const packing = [
    { id: 'a', participant: 'me' },
    { id: 'r', participant: null, recommended: true }
  ];
  assert.deepEqual(
    myBag(packing, 'me').map((p) => p.id),
    ['a']
  );
});

// ── splitPacking ─────────────────────────────────────────────────────────────

test('splitPacking: separates your pack from open recommendations', () => {
  const packing = [
    { id: 'mine', participant: 'me' },
    { id: 'theirs', participant: 'them' },
    { id: 'rec', participant: null, recommended: true }
  ];
  const out = splitPacking(packing, 'me');
  assert.deepEqual(
    out.mine.map((p) => p.id),
    ['mine']
  );
  assert.deepEqual(
    out.recommendations.map((p) => p.id),
    ['rec']
  );
});

test("splitPacking: never returns another person's items in any bucket", () => {
  // The privacy guarantee: private means not transmitted, not merely hidden.
  const packing = [
    { id: 'theirs', participant: 'them' },
    { id: 'theirs2', participant: 'them' }
  ];
  const out = splitPacking(packing, 'me');
  assert.deepEqual(out.mine, []);
  assert.deepEqual(out.recommendations, []);
});

test('splitPacking: an adopted recommendation stops being suggested', () => {
  const packing = [
    { id: 'rec', participant: null, recommended: true },
    { id: 'mine', participant: 'me', from_recommendation: 'rec' }
  ];
  const out = splitPacking(packing, 'me');
  assert.deepEqual(out.recommendations, []);
  assert.equal(out.mine.length, 1);
});

test("splitPacking: a recommendation someone ELSE adopted still shows for you", () => {
  const packing = [
    { id: 'rec', participant: null, recommended: true },
    { id: 'theirs', participant: 'them', from_recommendation: 'rec' }
  ];
  const out = splitPacking(packing, 'me');
  assert.deepEqual(
    out.recommendations.map((p) => p.id),
    ['rec']
  );
});

test('splitPacking: a signed-out viewer gets recommendations but no pack', () => {
  const packing = [
    { id: 'rec', participant: null, recommended: true },
    { id: 'theirs', participant: 'them' }
  ];
  const out = splitPacking(packing, null);
  assert.deepEqual(out.mine, []);
  assert.equal(out.recommendations.length, 1);
});

// ── isShared ─────────────────────────────────────────────────────────────────

test('isShared: the from_gear link IS the visibility flag', () => {
  // No separate `visible` column to drift out of sync with the public list.
  assert.equal(isShared({ from_gear: 'g1' }), true);
  assert.equal(isShared({ from_gear: null }), false);
  assert.equal(isShared({}), false);
});

// ── trip-size scaling ────────────────────────────────────────────────────────

test('publicListApplies: pointless solo, useful from two people up', () => {
  // "Who's bringing this?" has only one possible answer on a solo trip.
  assert.equal(publicListApplies(0), false);
  assert.equal(publicListApplies(1), false);
  assert.equal(publicListApplies(2), true);
  assert.equal(publicListApplies(8), true);
});

test('quantitiesApply: only once there is a real crew', () => {
  assert.equal(quantitiesApply(2), false);
  assert.equal(quantitiesApply(3), true);
});

// ── sortByNeed ───────────────────────────────────────────────────────────────

test('sortByNeed: still-needed items float above covered ones', () => {
  const out = sortByNeed([
    { id: 'covered', remaining: 0 },
    { id: 'needed', remaining: 1 },
    { id: 'covered2', remaining: 0 },
    { id: 'partial', remaining: 2 }
  ]);
  assert.deepEqual(
    out.map((g) => g.id),
    ['needed', 'partial', 'covered', 'covered2']
  );
});

test('sortByNeed: stable within each group, so creation order survives', () => {
  const out = sortByNeed([
    { id: 'a', remaining: 1 },
    { id: 'b', remaining: 1 },
    { id: 'c', remaining: 1 }
  ]);
  assert.deepEqual(
    out.map((g) => g.id),
    ['a', 'b', 'c']
  );
});

test('sortByNeed: does not mutate the input', () => {
  const input = [{ id: 'covered', remaining: 0 }, { id: 'needed', remaining: 1 }];
  sortByNeed(input);
  assert.deepEqual(
    input.map((g) => g.id),
    ['covered', 'needed']
  );
});

// ── canRecommend ─────────────────────────────────────────────────────────────

test('canRecommend: organizers only', () => {
  // A suggestion lands in everyone's pack, so it carries the trip's authority.
  assert.equal(canRecommend(true), true);
  assert.equal(canRecommend(false), false);
});

// ── bringStatus ──────────────────────────────────────────────────────────────

test('bringStatus: counts covered gear and packed bag items', () => {
  const s = bringStatus(
    [{ remaining: 0 }, { remaining: 2 }, { remaining: 0 }],
    [{ checked: true }, { checked: false }]
  );
  assert.equal(s.covered, 2);
  assert.equal(s.gearTotal, 3);
  assert.equal(s.packed, 1);
  assert.equal(s.bagTotal, 2);
  assert.equal(s.allCovered, false);
  assert.equal(s.allPacked, false);
});

test('bringStatus: an owned-but-unticked bag is NOT complete', () => {
  // The old PackingSummary counted `checked || participant`, so a bag of
  // untouched items reported itself fully packed. This is the fix.
  const s = bringStatus([], [{ checked: false }, { checked: false }]);
  assert.equal(s.packed, 0);
  assert.equal(s.allPacked, false);
});

test('bringStatus: all-covered and all-packed only when everything is done', () => {
  const s = bringStatus([{ remaining: 0 }], [{ checked: true }]);
  assert.equal(s.allCovered, true);
  assert.equal(s.allPacked, true);
});

test('bringStatus: empty lists are not "all done"', () => {
  // Nothing to bring shouldn't claim a false victory.
  const s = bringStatus([], []);
  assert.equal(s.allCovered, false);
  assert.equal(s.allPacked, false);
});
