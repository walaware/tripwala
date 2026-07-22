// "What to bring" — the domain logic behind the group's gear list and each
// person's own bag.
//
// Extracted from loadTrip.js and the actions endpoint so it can be tested
// without a PocketBase instance. These rules used to live inline in DB-calling
// code and had no test coverage at all, which made the gear/packing
// consolidation risky to attempt.
//
// Two concepts, deliberately distinct:
//   • GEAR — one thing the group needs, possibly several of, claimed by whoever
//     is bringing it. Answers "is the stove covered, and by whom?"
//   • BAG  — your own private checklist. Nobody sees anyone else's. Seeded
//     automatically from what you claimed (see `from_gear`).

/**
 * Shape raw gear rows + their claims into what the UI renders. `remaining` is
 * the headline: qty still unclaimed, floored at 0 so an over-claimed item reads
 * as covered rather than negative.
 *
 * @param {Array<{ id: string, name: string, category?: string, notes?: string, qty_needed?: number }>} gearItems
 * @param {Array<{ id: string, gear_item: string, participant: string, qty_claimed?: number }>} gearClaims
 * @param {Record<string, string>} nameById participant id → display name
 */
export function shapeGear(gearItems, gearClaims, nameById = {}) {
  /** @type {Record<string, Array<{ id: string, participant: string, participantName: string, qty_claimed: number }>>} */
  const claimsByItem = {};
  for (const c of gearClaims) {
    (claimsByItem[c.gear_item] ??= []).push({
      id: c.id,
      participant: c.participant,
      participantName: nameById[c.participant] ?? 'Someone',
      qty_claimed: c.qty_claimed ?? 1
    });
  }

  return gearItems.map((g) => {
    const claims = claimsByItem[g.id] ?? [];
    const claimed = claims.reduce((sum, c) => sum + (c.qty_claimed ?? 1), 0);
    const needed = g.qty_needed ?? 1;
    return {
      id: g.id,
      name: g.name,
      category: g.category,
      notes: g.notes,
      qty_needed: needed,
      claimed,
      remaining: Math.max(0, needed - claimed),
      claims
    };
  });
}

/**
 * How much a fresh claim takes on: everything still outstanding, but always at
 * least 1 so claiming an already-covered item is still a meaningful act ("I'll
 * bring a spare") rather than a no-op row.
 *
 * @param {number} qtyNeeded
 * @param {Array<{ qty_claimed?: number }>} existingClaims
 */
export function claimQty(qtyNeeded, existingClaims) {
  const claimed = existingClaims.reduce((s, c) => s + (c.qty_claimed ?? 1), 0);
  return Math.max(1, (qtyNeeded || 1) - claimed);
}

/**
 * Whether `meId` may tick/untick a packing item. Your bag is yours: only its
 * owner (or an organizer, who can tidy up on anyone's behalf) may toggle it.
 * An ownerless row — legacy data, or a group item from before the gear/bag
 * split — is toggleable by any member.
 *
 * @param {{ participant?: string | null }} item
 * @param {string} meId
 * @param {boolean} isOrganizer
 */
export function canTogglePacking(item, meId, isOrganizer) {
  if (!item.participant) return true;
  return item.participant === meId || isOrganizer;
}

/**
 * The items in your own pack. Everyone else's are never returned — they aren't
 * merely hidden in the UI, they never reach the caller.
 *
 * @template {{ participant?: string | null, recommended?: boolean }} T
 * @param {T[]} packing
 * @param {string | null | undefined} currentParticipantId
 * @returns {T[]}
 */
export function myBag(packing, currentParticipantId) {
  if (!currentParticipantId) return [];
  return packing.filter((p) => !p.recommended && p.participant === currentParticipantId);
}

/**
 * Split raw packing rows into the two things the personal half renders.
 *
 * This runs SERVER-side on purpose. Previously every packing row — including
 * other people's private items — was sent to the browser and merely filtered out
 * in the component. Private has to mean *not transmitted*.
 *
 * There's no "other people's items" bucket: an item you've made visible becomes
 * an item on the PUBLIC list that you own (see `shareToPublic`), so the crew sees
 * it there rather than through a window into your pack.
 *
 * @template {{ id: string, participant?: string | null, recommended?: boolean, from_recommendation?: string | null }} T
 * @param {T[]} packing
 * @param {string | null | undefined} meId
 * @returns {{ mine: T[], recommendations: T[] }}
 */
export function splitPacking(packing, meId) {
  const mine = myBag(packing, meId);
  // A suggestion you've already taken up shouldn't keep being suggested.
  const adopted = new Set(mine.map((p) => p.from_recommendation).filter(Boolean));

  return {
    mine,
    recommendations: packing.filter((p) => p.recommended && !adopted.has(p.id))
  };
}

/**
 * Whether a personal item is also on the public list. Sharing an item creates a
 * public counterpart owned by you and links the two with `from_gear` — the same
 * link claiming public gear already creates in the other direction. So the link
 * itself is the answer; there's no separate visibility flag to drift out of sync.
 *
 * @param {{ from_gear?: string | null }} item
 */
export function isShared(item) {
  return Boolean(item.from_gear);
}

/**
 * Whether the public list is worth showing at all. It answers "who's bringing
 * this?", which nobody needs on a solo trip — there's only one candidate. Below
 * two people the whole band collapses and the surface is just your own pack.
 *
 * @param {number} participantCount
 */
export function publicListApplies(participantCount) {
  return participantCount > 1;
}

/**
 * Whether quantities are meaningful. "We need 3 of these" only starts to matter
 * once there's a real crew; for a pair it's noise.
 *
 * @param {number} participantCount
 */
export function quantitiesApply(participantCount) {
  return participantCount >= 3;
}

/**
 * Whether `meId` may add or withdraw organizer recommendations. Suggestions
 * carry the trip's authority, so only organizers write them — anyone could
 * otherwise push items into everybody's pack.
 *
 * @param {boolean} isOrganizer
 */
export function canRecommend(isOrganizer) {
  return isOrganizer === true;
}

/**
 * Order the public list so what still needs doing is at the top. An item mixes
 * "we need this" and "I'm bringing this" in one list — sorting by coverage keeps
 * the asks visible and lets the covered ones settle underneath.
 *
 * Stable within each group, so the underlying creation order still shows.
 *
 * @template {{ remaining: number }} T
 * @param {T[]} gear
 * @returns {T[]}
 */
export function sortByNeed(gear) {
  return gear
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const aNeeded = a.g.remaining > 0 ? 0 : 1;
      const bNeeded = b.g.remaining > 0 ? 0 : 1;
      return aNeeded - bNeeded || a.i - b.i;
    })
    .map(({ g }) => g);
}

/**
 * Headline progress for the merged Gear surface.
 *
 * `covered` counts public items with nothing outstanding; `packed` counts ticked
 * items in your own pack. Note `packed` deliberately keys off `checked` alone —
 * the old packing summary counted any item that merely had an owner as done, so
 * a pack full of untouched items reported itself complete.
 *
 * @param {Array<{ remaining: number }>} gear
 * @param {Array<{ checked?: boolean }>} bag
 */
export function bringStatus(gear, bag) {
  const covered = gear.filter((g) => g.remaining === 0).length;
  const packed = bag.filter((b) => b.checked).length;
  return {
    covered,
    gearTotal: gear.length,
    packed,
    bagTotal: bag.length,
    allCovered: gear.length > 0 && covered === gear.length,
    allPacked: bag.length > 0 && packed === bag.length
  };
}
