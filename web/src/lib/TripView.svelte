<script>
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { tripAction } from '$lib/tripClient.js';
  import { fmtDateRange, tripEmoji } from '$lib/format.js';
  import { useShell } from '$lib/shell.svelte.js';

  // Full section components — reused verbatim as the focused ("spoke") views.
  import ItinerarySection from '$lib/sections/ItinerarySection.svelte';
  import BookingsSection from '$lib/sections/BookingsSection.svelte';
  import MapSection from '$lib/sections/MapSection.svelte';
  import PeopleSection from '$lib/sections/PeopleSection.svelte';
  import GearSection from '$lib/sections/GearSection.svelte';
  import MealsSection from '$lib/sections/MealsSection.svelte';
  import PackingSection from '$lib/sections/PackingSection.svelte';
  import ExpensesSection from '$lib/sections/ExpensesSection.svelte';
  import ImmichSection from '$lib/sections/ImmichSection.svelte';
  import SafetySection from '$lib/sections/SafetySection.svelte';
  import WrappedSection from '$lib/sections/WrappedSection.svelte';

  // Dashboard chrome + compact rail summaries.
  import TripHeader from '$lib/sections/TripHeader.svelte';
  import StatStrip from '$lib/sections/StatStrip.svelte';
  import RailModule from '$lib/sections/RailModule.svelte';
  import CrewSummary from '$lib/sections/summary/CrewSummary.svelte';
  import BookingsSummary from '$lib/sections/summary/BookingsSummary.svelte';
  import MapSummary from '$lib/sections/summary/MapSummary.svelte';
  import PackingSummary from '$lib/sections/summary/PackingSummary.svelte';
  import GearSummary from '$lib/sections/summary/GearSummary.svelte';
  import FoodSummary from '$lib/sections/summary/FoodSummary.svelte';
  import ExpensesSummary from '$lib/sections/summary/ExpensesSummary.svelte';

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
  const participants = $derived(data.participants);
  const gear = $derived(data.gear);
  const meals = $derived(data.meals);
  const itineraryItems = $derived(data.itineraryItems ?? []);
  const emoji = $derived(tripEmoji(trip.trip_type));

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);
  const maybe = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'maybe').length);

  const isPast = $derived.by(() => {
    if (trip.status === 'completed') return true;
    const end = trip.end_date || trip.start_date;
    if (!end) return false;
    const e = new Date(end);
    if (Number.isNaN(e.getTime())) return false;
    const n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) >
      Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  });

  const dietaryNotes = $derived(
    participants
      .filter((/** @type {any} */ p) => (p.dietary || '').trim())
      .map((/** @type {any} */ p) => ({ name: p.display_name, dietary: p.dietary }))
  );

  const meta = $derived(
    [
      trip.start_date ? fmtDateRange(trip.start_date, trip.end_date) : '',
      trip.location,
      `${going} going`,
      maybe ? `${maybe} maybe` : ''
    ]
      .filter(Boolean)
      .join(' · ')
  );

  const hidden = $derived(new Set(trip.hidden_sections ?? []));
  /** @param {string} key */
  const isHidden = (key) => hidden.has(key);
  const hasSafety = $derived(!!(trip.emergency_info || '').trim());
  const hasPhotos = $derived(!!(trip.immich_album_url || '').trim());

  // The rail modules (compact summaries on desktop; status rows on mobile). The
  // house-question titles are the redesign's voice. Itinerary is the main column,
  // not a rail card. Order mirrors the mockup, then the superset extras.
  const RAIL = [
    { key: 'crew', emoji: '🙌', title: "Who's coming?", nav: 'Members' },
    { key: 'bookings', emoji: '🎫', title: "What's booked?", nav: 'Bookings' },
    { key: 'map', emoji: '🗺️', title: 'Pins & places', nav: 'Map' },
    { key: 'packing', emoji: '🧳', title: 'Packing list', nav: 'Packing' },
    { key: 'gear', emoji: '🎒', title: "Who's bringing what?", nav: 'Gear' },
    { key: 'food', emoji: '🍳', title: "Who's cooking?", nav: 'Food' },
    { key: 'expenses', emoji: '💸', title: 'Who paid what?', nav: 'Expenses' }
  ];
  const visibleRail = $derived(RAIL.filter((r) => !hidden.has(r.key)));
  // Modules turned off for this trip → one dashed "not on this trip" row.
  const offModules = $derived(
    [
      ...(isHidden('itinerary') ? [{ emoji: '🗓️', nav: 'Itinerary' }] : []),
      ...RAIL.filter((r) => hidden.has(r.key)),
      ...(hasPhotos && isHidden('photos') ? [{ emoji: '📷', nav: 'Photos' }] : [])
    ]
  );

  // Section nav published to the shell (scrollSpy anchors). Hidden sections drop
  // out of the nav too.
  const visibleNav = $derived(
    [
      { key: 'overview', label: 'Overview', icon: '✨', href: '#overview' },
      ...(isPast ? [{ key: 'wrapped', label: 'Wrapped', icon: '🎉', href: '#wrapped' }] : []),
      ...(hasSafety ? [{ key: 'safety', label: 'Safety', icon: '🚨', href: '#safety' }] : []),
      ...(!isHidden('itinerary') ? [{ key: 'itinerary', label: 'Itinerary', icon: '🗓️', href: '#itinerary' }] : []),
      ...visibleRail.map((r) => ({ key: r.key, label: r.nav, icon: r.emoji, href: `#${r.key}` })),
      ...(hasPhotos && !isHidden('photos') ? [{ key: 'photos', label: 'Photos', icon: '📷', href: '#photos' }] : [])
    ]
  );

  // ── Focus model ──────────────────────────────────────────────────────────
  // A single `focus` (mapped to ?focus=<key>) drives both the desktop "open the
  // full module" view and the mobile hub-&-spoke. Deep-linkable + back/forward.
  const focus = $derived.by(() => {
    const f = page.url.searchParams.get('focus');
    return f && !hidden.has(f) ? f : null;
  });
  /** @param {string} key */
  function setFocus(key) {
    goto(`${page.url.pathname}?focus=${encodeURIComponent(key)}`, { noScroll: true, keepFocus: true });
  }
  function clearFocus() {
    goto(page.url.pathname, { noScroll: true, keepFocus: true });
  }
  const settingsHref = $derived(`${page.url.pathname.replace(/\/$/, '')}/settings`);
  const goSettings = () => goto(settingsHref);

  function goDecide() {
    const el = typeof document !== 'undefined' ? document.getElementById('itinerary') : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else setFocus('itinerary');
  }

  const addActions = [
    { icon: '🗓️', label: 'Itinerary entry', onClick: () => setFocus('itinerary') },
    { icon: '🎫', label: 'Booking', onClick: () => setFocus('bookings') },
    { icon: '💸', label: 'Expense', onClick: () => setFocus('expenses') },
    { icon: '📍', label: 'Map pin', onClick: () => setFocus('map') },
    { icon: '🤔', label: 'Something to decide', onClick: () => setFocus('itinerary') }
  ];

  // Organizer hides a section from its ⋯ menu (restore from Trip settings).
  /** @param {string} key */
  async function hideSection(key) {
    try {
      await tripAction(trip.share_token, { op: 'section_hide', key });
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    }
  }
  /** @param {string} key */
  const hideHandler = (key) => (ownerMode ? () => hideSection(key) : null);

  // Publish the section nav + trip identity up to the layout's AppShell
  // (contextual mode). Cleared on unmount.
  const shell = useShell();
  $effect(() => {
    shell.trip = { title: trip.name, subtitle: meta, emoji, nav: visibleNav };
  });
  $effect(() => () => {
    shell.trip = null;
  });

  // Live updates via short-poll while the tab is visible.
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
        invalidateAll();
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

{#if focus}
  <!-- Focused module (spoke) — the full section alone, reached from a rail
       summary / the ＋Add menu / a mobile status row. -->
  <div class="trip-stack">
    <button type="button" class="self-start font-body text-[13.5px] font-extrabold text-coral-600 hover:underline" onclick={clearFocus}>← Back to dashboard</button>
    {#if focus === 'itinerary'}
      <ItinerarySection shareToken={trip.share_token} {itineraryItems} cities={data.cities ?? []} mapApp={data.mapApp ?? 'apple'} {trip} {currentParticipantId} {ownerMode} onHide={null} />
    {:else if focus === 'bookings'}
      <BookingsSection shareToken={trip.share_token} bookings={data.bookings ?? []} {currentParticipantId} {ownerMode} onHide={null} />
    {:else if focus === 'map'}
      <MapSection shareToken={trip.share_token} {trip} mapPins={data.mapPins ?? []} {currentParticipantId} {ownerMode} onHide={null} />
    {:else if focus === 'crew'}
      <PeopleSection shareToken={trip.share_token} {participants} {currentParticipantId} {ownerMode} {isPast} invitableFriends={data.invitableFriends ?? []} inviteVisibility={trip.invite_visibility ?? 'everyone'} onHide={null} />
    {:else if focus === 'gear'}
      <GearSection shareToken={trip.share_token} {gear} {currentParticipantId} onHide={null} />
    {:else if focus === 'food'}
      <MealsSection shareToken={trip.share_token} {meals} {currentParticipantId} {dietaryNotes} {trip} {ownerMode} onHide={null} />
    {:else if focus === 'packing'}
      <PackingSection shareToken={trip.share_token} packing={data.packing} {currentParticipantId} onHide={null} />
    {:else if focus === 'expenses'}
      <ExpensesSection shareToken={trip.share_token} expenses={data.expenses} settlement={data.settlement} {currentParticipantId} {ownerMode} onHide={null} />
    {:else if focus === 'photos'}
      <ImmichSection url={trip.immich_album_url} onHide={null} />
    {/if}
  </div>
{:else}
  <TripHeader {emoji} name={trip.name} {meta} {isPast} crew={participants} {addActions} />

  {#if top}{@render top()}{/if}

  <div class="trip-stack">
    {#if isPast}
      <section id="wrapped" class="anchor">
        <WrappedSection {trip} {participants} {gear} {meals} expenses={data.expenses} />
      </section>
    {:else}
      <section id="overview" class="anchor">
        <StatStrip {trip} {participants} {itineraryItems} onDecide={goDecide} />
      </section>
    {/if}

    {#if hasSafety}
      <section id="safety" class="anchor">
        <SafetySection info={trip.emergency_info} />
      </section>
    {/if}

    <div class="dash">
      <!-- Main column: the itinerary (Phase 3 replaces this with the dense
           city-grouped version). -->
      <div class="dash-main">
        {#if !isHidden('itinerary')}
          <section id="itinerary" class="anchor">
            <ItinerarySection shareToken={trip.share_token} {itineraryItems} cities={data.cities ?? []} mapApp={data.mapApp ?? 'apple'} {trip} {currentParticipantId} {ownerMode} onHide={hideHandler('itinerary')} />
          </section>
        {/if}
      </div>

      <!-- Rail column: compact module summaries; each opens the full module. -->
      <div class="dash-rail">
        {#each visibleRail as r (r.key)}
          <RailModule emoji={r.emoji} title={r.title} id={r.key} {ownerMode} onHide={hideHandler(r.key)} onSettings={goSettings}>
            {#if r.key === 'crew'}
              <CrewSummary {participants} onOpen={() => setFocus('crew')} />
            {:else if r.key === 'bookings'}
              <BookingsSummary bookings={data.bookings ?? []} onOpen={() => setFocus('bookings')} />
            {:else if r.key === 'map'}
              <MapSummary mapPins={data.mapPins ?? []} cities={data.cities ?? []} onOpen={() => setFocus('map')} />
            {:else if r.key === 'packing'}
              <PackingSummary packing={data.packing ?? []} onOpen={() => setFocus('packing')} />
            {:else if r.key === 'gear'}
              <GearSummary {gear} onOpen={() => setFocus('gear')} />
            {:else if r.key === 'food'}
              <FoodSummary {meals} onOpen={() => setFocus('food')} />
            {:else if r.key === 'expenses'}
              <ExpensesSummary expenses={data.expenses ?? []} settlement={data.settlement} {currentParticipantId} onOpen={() => setFocus('expenses')} />
            {/if}
          </RailModule>
        {/each}

        {#if hasPhotos && !isHidden('photos')}
          <RailModule emoji="📷" title="Shared photos" id="photos" {ownerMode} onHide={hideHandler('photos')} onSettings={goSettings}>
            <button type="button" class="block font-body text-[13px] font-extrabold text-coral-600 hover:underline" onclick={() => setFocus('photos')}>Open the album →</button>
          </RailModule>
        {/if}

        {#if offModules.length}
          <button type="button" class="off-row" onclick={goSettings}>
            ＋ Not on this trip: {offModules.map((m) => `${m.emoji} ${m.nav}`).join(' · ')} — turn on in settings
          </button>
        {/if}
      </div>
    </div>

    {#if !currentParticipantId}
      <p class="px-1 text-center font-body text-xs font-bold text-cocoa-500">
        Claim a name above to RSVP, grab gear, and sign up for food.
      </p>
    {/if}
  </div>
{/if}

<style>
  .trip-stack {
    display: flex;
    flex-direction: column;
    gap: var(--stack-gap, 14px);
  }
  .anchor {
    scroll-margin-top: 116px;
  }
  .dash {
    display: flex;
    gap: 26px;
    align-items: flex-start;
  }
  .dash-main {
    flex: 1.5;
    min-width: 0;
  }
  .dash-rail {
    flex: 1;
    min-width: 300px;
    display: flex;
    flex-direction: column;
    gap: var(--stack-gap, 14px);
  }
  /* Below the desktop breakpoint the dashboard stacks (Phase 4 swaps this for
     the mobile hub status list). */
  @media (max-width: 919px) {
    .dash {
      flex-direction: column;
    }
    .dash-main,
    .dash-rail {
      width: 100%;
      min-width: 0;
    }
  }
  .off-row {
    width: 100%;
    text-align: left;
    border: 1.5px dashed var(--color-sand-300);
    border-radius: var(--radius-md, 10px);
    padding: 12px 14px;
    font-family: var(--font-body);
    font-size: 12.5px;
    font-weight: 800;
    color: var(--color-text-muted);
    transition: border-color 0.15s;
  }
  .off-row:hover {
    border-color: var(--color-coral-300);
  }
</style>
