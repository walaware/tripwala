<script>
  import ClaimMeter from './ClaimMeter.svelte';

  /** @type {{ meals: Array<any>, onOpen: () => void }} */
  let { meals, onOpen } = $props();

  const total = $derived(meals.length);
  const done = $derived(meals.filter((/** @type {any} */ m) => m.ownerParticipant).length);
  const open = $derived(
    meals
      .filter((/** @type {any} */ m) => !m.ownerParticipant)
      .map((/** @type {any} */ m) => ({ key: m.id, emoji: '🍳', label: m.label }))
  );
</script>

<ClaimMeter
  {done} {total} {open}
  doneLabel="Cooks assigned"
  claimLabel="🙋 Cook"
  allDoneMsg="🎉 Every meal has a cook."
  emptyMsg="No meals planned yet."
  seeAllLabel={total ? `See all ${total} meals →` : '＋ Add a meal'}
  {onOpen}
/>
