<script>
  // Rail summary for the trip map. Normally a compact striped peek; when the
  // rail is sparse (few enabled sections) TripView passes `expanded` and this
  // shows a real read-only mini map instead — provided there's something to
  // frame (pins, or the trip's pinned location). Clicking anywhere opens the
  // full map module, same as before.
  import MiniMap from '$lib/ui/MiniMap.svelte';
  import { hasCoords } from '$lib/coords.js';

  /**
   * @type {{
   *   mapPins: Array<any>,
   *   cities: Array<any>,
   *   trip?: any,
   *   expanded?: boolean,
   *   onOpen: () => void
   * }}
   */
  let { mapPins, cities, trip = null, expanded = false, onOpen } = $props();

  const cityCount = $derived(cities.length);
  const label = $derived(
    mapPins.length
      ? `${mapPins.length} pin${mapPins.length === 1 ? '' : 's'}${cityCount ? ` across ${cityCount} cit${cityCount === 1 ? 'y' : 'ies'}` : ''}`
      : 'No pins yet'
  );
  // A mini map is only worth the space when it can frame something real.
  const showMap = $derived(expanded && (mapPins.length > 0 || hasCoords(trip?.lat, trip?.lng)));
</script>

<button type="button" class="block w-full text-left" onclick={onOpen}>
  {#if showMap}
    <MiniMap pins={mapPins} {trip} height={200} />
  {:else}
    <div class="peek" aria-hidden="true">📍 🏠 🍷</div>
  {/if}
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
