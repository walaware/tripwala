<script>
  import { Card } from '@walaware/design';
  import LocationHeroCard from '$lib/ui/LocationHeroCard.svelte';
  import WeatherCard from '$lib/ui/WeatherCard.svelte';

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
  // WeatherCard self-hides when the trip is outside the forecast window, so we
  // only skip the whole card when there's definitely nothing to show.
  const show = $derived(hasHero || hasDesc || !!(trip.location || '').trim());
</script>

{#if show}
  <Card>
    <LocationHeroCard location={trip.pickedLocation ?? null} />
    <WeatherCard location={trip.location} startDate={trip.start_date} endDate={trip.end_date} />
    {#if hasDesc}
      <div
        class="mt-4 rounded-2xl bg-sand-100 p-4 font-body text-[13.5px] leading-relaxed text-cocoa-700 [&_a]:font-extrabold [&_a]:text-coral-700 [&_a]:underline [&_a]:underline-offset-2"
      >
        {@html trip.description}
      </div>
    {/if}
  </Card>
{/if}
