<script>
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { Chip, Card, CardHeader, Button } from '@walaware/design';
  import PeopleSection from '$lib/sections/PeopleSection.svelte';
  import GearSection from '$lib/sections/GearSection.svelte';
  import MealsSection from '$lib/sections/MealsSection.svelte';
  import PackingSection from '$lib/sections/PackingSection.svelte';
  import { fmtDateRange } from '$lib/format.js';
  import { page } from '$app/state';
  import { useShell } from '$lib/shell.svelte.js';

  /**
   * @type {{
   *   data: any,
   *   ownerMode?: boolean,
   *   currentParticipantId?: string | null,
   *   top?: import('svelte').Snippet
   * }}
   */
  let { data, ownerMode = false, currentParticipantId = null, top } = $props();

  const trip = $derived(data.trip);
  const settingsHref = $derived(`${page.url.pathname.replace(/\/$/, '')}/settings`);
  const participants = $derived(data.participants);
  const gear = $derived(data.gear);
  const meals = $derived(data.meals);

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);
  const maybe = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'maybe').length);
  const openGear = $derived(gear.filter((/** @type {any} */ g) => g.remaining > 0).length);

  // Dates · location, joined with guaranteed spacing (Svelte collapses the
  // whitespace around an inline {#if}, which would otherwise tighten the dot).
  const meta = $derived(
    [trip.start_date ? fmtDateRange(trip.start_date, trip.end_date) : '', trip.location]
      .filter(Boolean)
      .join(' · ')
  );

  // The trip page is one scroll of `<section id>` modules under the shell's
  // contextual section nav (scrollSpy). Each row targets a section below; the
  // dimmed "soon" rows are roadmap modules. Icons mirror each section's CardHeader.
  const SECTION_NAV = [
    { key: 'overview', label: 'Overview', icon: '📋', href: '#overview' },
    { key: 'crew', label: "Who's coming", icon: '🙌', href: '#crew' },
    { key: 'gear', label: 'Gear', icon: '🎒', href: '#gear' },
    { key: 'food', label: 'Food', icon: '🍳', href: '#food' },
    { key: 'packing', label: 'Packing', icon: '🧳', href: '#packing' },
    { key: 'itinerary', label: 'Itinerary', icon: '🗓️', soon: true },
    { key: 'map', label: 'Map', icon: '🗺️', soon: true },
    { key: 'photos', label: 'Photos', icon: '📸', soon: true }
  ];

  // Publish the section nav + trip name up to the layout's AppShell, flipping it
  // into contextual mode. Cleared on unmount so leaving the trip restores app level.
  const shell = useShell();
  $effect(() => {
    shell.trip = { title: trip.name, nav: SECTION_NAV };
    return () => {
      shell.trip = null;
    };
  });

  // Live updates via short-poll (the brief allows websocket OR short-poll). The
  // browser can't subscribe to PocketBase directly now that collection rules are
  // locked, so we re-run the server load every few seconds while the tab is
  // visible — enough to feel live without hammering the server in the
  // background. A write also refreshes immediately, so this mainly surfaces
  // OTHER people's changes.
  const POLL_MS = 4000;
  onMount(() => {
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer;
    const tick = () => {
      if (document.visibilityState === 'visible') invalidateAll();
    };
    const start = () => {
      stop();
      timer = setInterval(tick, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        invalidateAll(); // catch up immediately on refocus
        start();
      } else {
        stop();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

<!-- Sticky trip header — auto-measured by the shell for the scrollSpy offset
     (data-appshell-sticky). Compact: name + dates/location + status chips. -->
<header data-appshell-sticky class="trip-head" style="background: var(--color-bg-app)">
  <h1 class="font-display text-[22px] font-bold leading-tight text-cocoa-900">{trip.name}</h1>
  {#if meta}
    <div class="mt-0.5 font-body text-[13px] font-extrabold text-coral-600">{meta}</div>
  {/if}
  <div class="mt-2 flex flex-wrap gap-1.5">
    <Chip tone="coral">🎉 {going} going</Chip>
    {#if maybe > 0}<Chip tone="sun">🤔 {maybe} maybe</Chip>{/if}
    <Chip tone="berry">🎒 {openGear} open</Chip>
  </div>
</header>

{#if top}{@render top()}{/if}

<div class="trip-stack">
  <section id="overview" class="trip-section">
    <Card>
      <CardHeader icon="📋" title="Overview" />
      {#if ownerMode}
        <div class="mb-3 flex items-center justify-between gap-3 rounded-md bg-sun-200 px-3.5 py-2.5">
          <span class="font-body text-[13px] font-bold text-cocoa-900">✨ You're an organizer — you can edit everything here.</span>
          <a
            href={settingsHref}
            class="shrink-0 font-body text-[13px] font-extrabold text-cocoa-900 underline underline-offset-2 hover:text-coral-700"
          >⚙️ Settings</a>
        </div>
      {/if}
      {#if trip.description}
        <!-- Trip details / directions. Links (Hipcamp, maps, …) live inline. -->
        <div
          class="rounded-2xl bg-sand-100 p-4 font-body text-[13.5px] leading-relaxed text-cocoa-700 [&_a]:font-extrabold [&_a]:text-coral-700 [&_a]:underline [&_a]:underline-offset-2"
        >
          {@html trip.description}
        </div>
      {:else}
        <p class="font-body text-[13.5px] font-bold text-cocoa-500">
          No trip details yet{#if ownerMode} — add directions, what to expect, or links in Settings{/if}.
        </p>
      {/if}
      {#if trip.expense_link}
        <Button href={trip.expense_link} target="_blank" variant="soft" size="sm" class="mt-3">
          💸 Split expenses ↗
        </Button>
      {/if}
    </Card>
  </section>

  <section id="crew" class="trip-section">
    <PeopleSection shareToken={trip.share_token} {participants} {currentParticipantId} {ownerMode} />
  </section>
  <section id="gear" class="trip-section">
    <GearSection shareToken={trip.share_token} {gear} {currentParticipantId} />
  </section>
  <section id="food" class="trip-section">
    <MealsSection shareToken={trip.share_token} {meals} {currentParticipantId} />
  </section>
  <section id="packing" class="trip-section">
    <PackingSection shareToken={trip.share_token} packing={data.packing} {currentParticipantId} />
  </section>

  {#if !currentParticipantId}
    <p class="px-1 text-center font-body text-xs font-bold text-cocoa-500">
      Claim a name above to RSVP, grab gear, and sign up for food.
    </p>
  {/if}
</div>

<style>
  /* Sticks under the shell's scroll container; the shell measures its height for
     the scrollSpy offset so section anchors land just below it. */
  .trip-head {
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 2px 0 12px;
    margin-bottom: var(--stack-gap, 14px);
    border-bottom: 1px solid var(--color-sand-300);
  }
  .trip-stack {
    display: flex;
    flex-direction: column;
    gap: var(--stack-gap, 14px);
  }
  /* Belt-and-suspenders for native anchor jumps; the shell scrolls with a
     measured offset, but keep sections clear of the sticky header regardless. */
  .trip-section {
    scroll-margin-top: 120px;
  }
</style>
