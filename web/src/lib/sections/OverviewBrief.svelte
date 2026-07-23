<script>
  import { Card } from '@walaware/design';
  import LocationHeroCard from '$lib/ui/LocationHeroCard.svelte';
  import WeatherCard from '$lib/ui/WeatherCard.svelte';
  import BackpackingForecast from '$lib/ui/BackpackingForecast.svelte';
  import { hasCoords } from '$lib/coords.js';

  /**
   * The trip's "brief": the picked-location photo, the forecast, and the plan
   * description. The Overview *stats* moved to the StatStrip; this keeps the
   * richer context that the strip has no room for (renders nothing when empty).
   *
   * @type {{ trip: any }}
   */
  let { trip } = $props();

  const hasHero = $derived(!!trip.pickedLocation);
  const hasDesc = $derived(!!(trip.description || '').trim());
  // A pinned backpacking trip gets the richer planner surface (hourly scrobbler +
  // backcountry briefing); everything else keeps the compact forecast strip,
  // which also handles the legacy name-geocode fallback for unpinned trips.
  const backcountry = $derived(trip.trip_type === 'backpacking' && hasCoords(trip.lat, trip.lng));
  // WeatherCard self-hides when the trip is outside the forecast window, so we
  // only skip the whole card when there's definitely nothing to show.
  const show = $derived(hasHero || hasDesc || !!(trip.location || '').trim());
</script>

{#if show}
  <Card>
    <LocationHeroCard location={trip.pickedLocation ?? null} />
    {#if backcountry}
      <BackpackingForecast
        location={trip.location}
        lat={trip.lat}
        lng={trip.lng}
        placeName={trip.place_name}
        startDate={trip.start_date}
        endDate={trip.end_date}
      />
    {:else}
      <WeatherCard
        location={trip.location}
        lat={trip.lat}
        lng={trip.lng}
        placeName={trip.place_name}
        startDate={trip.start_date}
        endDate={trip.end_date}
      />
    {/if}
    {#if hasDesc}
      <div
        class="mt-4 rounded-2xl bg-sand-100 p-4 font-body text-[13.5px] leading-relaxed text-cocoa-700 [&_a]:font-extrabold [&_a]:text-coral-700 [&_a]:underline [&_a]:underline-offset-2"
      >
        {@html trip.description}
      </div>
    {/if}
  </Card>
{/if}
