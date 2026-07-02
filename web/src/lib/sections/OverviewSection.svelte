<script>
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import LocationHeroCard from '$lib/ui/LocationHeroCard.svelte';
  import WeatherCard from '$lib/ui/WeatherCard.svelte';
  import { tripLength, tripEmoji, tripTypeLabel } from '$lib/format.js';

  /**
   * @type {{
   *   trip: any,
   *   participants: Array<any>,
   *   gear: Array<any>,
   *   meals: Array<any>,
   *   ownerMode?: boolean,
   *   settingsHref?: string,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let {
    trip,
    participants,
    gear,
    meals,
    ownerMode = false,
    settingsHref = '',
    collapsed = false,
    onToggle = null
  } = $props();

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);

  // "Claimed" = gear that's fully covered (remaining 0) + meals with an owner,
  // over the total claimable across both — drives the stat + the progress bar.
  const claimable = $derived(gear.length + meals.length);
  const claimed = $derived(
    gear.filter((/** @type {any} */ g) => g.remaining === 0).length +
      meals.filter((/** @type {any} */ m) => m.ownerParticipant).length
  );
  const pct = $derived(claimable ? Math.round((claimed / claimable) * 100) : 0);

  // Live countdown to the start date (UTC-day granularity). `now` ticks each
  // minute so the value rolls over (… → tomorrow → today! → now → wrapped)
  // without a reload.
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(id);
  });
  const countdown = $derived.by(() => {
    if (trip.status === 'completed' || trip.status === 'past') return 'wrapped';
    if (!trip.start_date) return 'TBD';
    const n = new Date(now);
    const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const s = new Date(trip.start_date);
    const start = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    const days = Math.round((start - today) / 86400000);
    if (days > 1) return `in ${days} days`;
    if (days === 1) return 'tomorrow';
    if (days === 0) return 'today!';
    return -days < tripLength(trip.start_date, trip.end_date).days ? 'now' : 'wrapped';
  });

  // The three stat tiles adapt to the trip: the "Claimed" tile only makes sense
  // when Gear or Food is actually in play, and "Crew" isn't interesting for a
  // solo/couple trip. We drop the ones that don't fit and pad with lighter,
  // always-available tiles so the row stays at three.
  const hidden = $derived(Array.isArray(trip.hidden_sections) ? trip.hidden_sections : []);
  const gearFoodHidden = $derived(hidden.includes('gear') && hidden.includes('food'));
  const showClaimed = $derived(claimable > 0 && !gearFoodHidden);
  const crewSize = $derived(participants.length);
  const showCrew = $derived(crewSize > 2);

  const nights = $derived(tripLength(trip.start_date, trip.end_date).nights);
  const lengthTile = $derived({
    label: 'Length',
    value: nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : 'Day trip'
  });
  const vibeTile = $derived({
    label: 'Vibe',
    value: `${tripEmoji(trip.trip_type)} ${tripTypeLabel(trip.trip_type)}`
  });
  // A little delight when it's just you (or the two of you) — fills the slot the
  // Crew tile vacates on an intimate trip.
  const partyTile = $derived.by(() => {
    if (crewSize <= 1) return { label: 'Trip', value: 'Solo 🎒' };
    if (crewSize === 2) return { label: 'Party of', value: 'two 💕' };
    return null;
  });

  const tiles = $derived.by(() => {
    const out = [{ label: 'Countdown', value: countdown }];
    if (showCrew) out.push({ label: 'Crew', value: `${going} going` });
    if (showClaimed) out.push({ label: 'Claimed', value: `${claimed}/${claimable}` });
    // Pad to three with fun fallbacks (party first so couples get the cute one).
    for (const t of [partyTile, lengthTile, vibeTile]) {
      if (out.length >= 3) break;
      if (t) out.push(t);
    }
    return out.slice(0, 3);
  });
</script>

<SectionHeader emoji="✨" title="Overview" {collapsed} {onToggle} />
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

  {#if showClaimed}
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

  <!-- Forecast for the trip dates (only renders when the trip is within range). -->
  <WeatherCard location={trip.location} startDate={trip.start_date} endDate={trip.end_date} />

  {#if trip.description}
    <!-- Trip details / directions; inline links (Hipcamp, maps, …) live in the HTML. -->
    <div
      class="mt-4 rounded-2xl bg-sand-100 p-4 font-body text-[13.5px] leading-relaxed text-cocoa-700 [&_a]:font-extrabold [&_a]:text-coral-700 [&_a]:underline [&_a]:underline-offset-2"
    >
      {@html trip.description}
    </div>
  {/if}
</Card>
