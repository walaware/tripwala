<script>
  import ClaimMeter from './ClaimMeter.svelte';

  /** @type {{ packing: Array<any>, onOpen: () => void }} */
  let { packing, onOpen } = $props();

  const total = $derived(packing.length);
  const done = $derived(packing.filter((/** @type {any} */ p) => p.checked || p.participant).length);
  const open = $derived(
    packing
      .filter((/** @type {any} */ p) => !p.checked && !p.participant)
      .map((/** @type {any} */ p) => ({ key: p.id, emoji: '🧳', label: p.label }))
  );
</script>

<ClaimMeter
  {done} {total} {open}
  doneLabel="Packed"
  claimLabel="✓ Pack"
  allDoneMsg="🎉 Everything's packed."
  emptyMsg="Nothing on the packing list yet."
  seeAllLabel={total ? `See all ${total} items →` : '＋ Add packing items'}
  {onOpen}
/>
