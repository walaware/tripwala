<script>
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import LocationHeroCard from '$lib/ui/LocationHeroCard.svelte';
  import { tripLength } from '$lib/format.js';

  /**
   * @type {{
   *   trip: any,
   *   participants: Array<any>,
   *   gear: Array<any>,
   *   meals: Array<any>,
   *   ownerMode?: boolean,
   *   settingsHref?: string
   * }}
   */
  let { trip, participants, gear, meals, ownerMode = false, settingsHref = '' } = $props();

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);

  // "Claimed" = gear that's fully covered (remaining 0) + meals with an owner,
  // over the total claimable across both — drives the stat + the progress bar.
  const claimable = $derived(gear.length + meals.length);
  const claimed = $derived(
    gear.filter((/** @type {any} */ g) => g.remaining === 0).length +
      meals.filter((/** @type {any} */ m) => m.ownerParticipant).length
  );
  const pct = $derived(claimable ? Math.round((claimed / claimable) * 100) : 0);

  // Countdown to the start date at UTC-day granularity.
  const countdown = $derived.by(() => {
    if (trip.status === 'completed' || trip.status === 'past') return 'wrapped';
    if (!trip.start_date) return 'TBD';
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const s = new Date(trip.start_date);
    const start = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    const days = Math.round((start - today) / 86400000);
    if (days > 1) return `in ${days} days`;
    if (days === 1) return 'tomorrow';
    if (days === 0) return 'today!';
    return -days < tripLength(trip.start_date, trip.end_date).days ? 'now' : 'wrapped';
  });

  const tiles = $derived([
    { label: 'Countdown', value: countdown },
    { label: 'Crew', value: `${going} going` },
    { label: 'Claimed', value: `${claimed}/${claimable}` }
  ]);
</script>

<SectionHeader emoji="✨" title="Overview" />
<Card>
  <!-- Picked location's picture (if any), carried over from planning. -->
  <LocationHeroCard location={trip.pickedLocation ?? null} />

  <div class="grid grid-cols-3 gap-2.5">
    {#each tiles as t}
      <div class="rounded-md bg-surface-sunk px-2 py-3 text-center">
        <div class="font-body text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted">{t.label}</div>
        <div class="mt-0.5 font-display text-[16px] font-bold text-text-strong">{t.value}</div>
      </div>
    {/each}
  </div>

  {#if claimable}
    <div class="mt-4">
      <div class="mb-1.5 flex items-center justify-between">
        <span class="font-body text-[12.5px] font-extrabold text-text-muted">Gear &amp; food claimed</span>
        <span class="font-body text-[12.5px] font-extrabold text-text-muted">{claimed}/{claimable}</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-sand-300">
        <div
          class="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300"
          style="width: {pct}%"
        ></div>
      </div>
    </div>
  {/if}

  {#if trip.description}
    <!-- Trip details / directions; inline links (Hipcamp, maps, …) live in the HTML. -->
    <div
      class="mt-4 rounded-2xl bg-sand-100 p-4 font-body text-[13.5px] leading-relaxed text-cocoa-700 [&_a]:font-extrabold [&_a]:text-coral-700 [&_a]:underline [&_a]:underline-offset-2"
    >
      {@html trip.description}
    </div>
  {/if}
</Card>
