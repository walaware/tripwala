<script>
  /** @type {{ mapPins: Array<any>, cities: Array<any>, onOpen: () => void }} */
  let { mapPins, cities, onOpen } = $props();

  const cityCount = $derived(cities.length);
  const label = $derived(
    mapPins.length
      ? `${mapPins.length} pin${mapPins.length === 1 ? '' : 's'}${cityCount ? ` across ${cityCount} cit${cityCount === 1 ? 'y' : 'ies'}` : ''}`
      : 'No pins yet'
  );
</script>

<button type="button" class="block w-full text-left" onclick={onOpen}>
  <div class="peek" aria-hidden="true">📍 🏠 🍷</div>
  <div class="mt-2.5 flex items-center gap-2">
    <span class="min-w-0 flex-1 truncate font-body text-[13.5px] font-extrabold text-text-strong">{label}</span>
    <span class="flex-none font-body text-[13px] font-extrabold text-coral-600">Open the map →</span>
  </div>
</button>

<style>
  .peek {
    height: 92px;
    display: grid;
    place-items: center;
    letter-spacing: 6px;
    font-size: 20px;
    border-radius: var(--radius-md, 10px);
    color: var(--color-text-muted);
    background: repeating-linear-gradient(
      45deg,
      var(--color-sand-100),
      var(--color-sand-100) 10px,
      var(--color-sand-200) 10px,
      var(--color-sand-200) 20px
    );
  }
</style>
