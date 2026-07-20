<script>
  import ClaimMeter from './ClaimMeter.svelte';

  /** @type {{ gear: Array<any>, onOpen: () => void }} */
  let { gear, onOpen } = $props();

  const total = $derived(gear.length);
  const done = $derived(gear.filter((/** @type {any} */ g) => g.remaining === 0).length);
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
  allDoneMsg="🎉 All gear's covered."
  emptyMsg="No shared gear yet."
  seeAllLabel={total ? `See all ${total} items →` : '＋ Add gear'}
  {onOpen}
/>
