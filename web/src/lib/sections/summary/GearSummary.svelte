<script>
  import ClaimMeter from './ClaimMeter.svelte';

  /**
   * Rail summary for the merged "what to bring" surface. Leads with the group's
   * list — that's the coordination half, the part someone else is waiting on.
   * Your own pack shows as a trailing note rather than competing for the meter.
   *
   * @type {{ gear: Array<any>, packing?: Array<any>, onOpen: () => void }}
   */
  let { gear, packing = [], onOpen } = $props();

  const total = $derived(gear.length);
  const done = $derived(gear.filter((/** @type {any} */ g) => g.remaining === 0).length);
  const mine = $derived(packing.filter((/** @type {any} */ p) => !p.recommended));
  const packed = $derived(mine.filter((/** @type {any} */ p) => p.checked).length);
  const open = $derived(
    gear
      .filter((/** @type {any} */ g) => g.remaining > 0)
      .map((/** @type {any} */ g) => ({ key: g.id, emoji: '🎒', label: g.name }))
  );
</script>

<ClaimMeter
  {done} {total} {open}
  doneLabel="Covered"
  claimLabel="🙌 Grab"
  allDoneMsg="🎉 The group's list is covered."
  emptyMsg="Nothing on the group's list yet."
  seeAllLabel={total ? `See all ${total} items →` : '＋ Add what to bring'}
  {onOpen}
/>

{#if mine.length}
  <button
    type="button"
    onclick={onOpen}
    class="mt-1.5 block w-full text-left font-body text-[12px] font-bold text-cocoa-400 hover:text-coral-600"
  >🧳 Your pack — {packed} of {mine.length} packed</button>
{/if}
