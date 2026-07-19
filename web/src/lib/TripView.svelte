<script>
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import OverviewSection from '$lib/sections/OverviewSection.svelte';
  import ItinerarySection from '$lib/sections/ItinerarySection.svelte';
  import MapSection from '$lib/sections/MapSection.svelte';
  import PeopleSection from '$lib/sections/PeopleSection.svelte';
  import GearSection from '$lib/sections/GearSection.svelte';
  import MealsSection from '$lib/sections/MealsSection.svelte';
  import WrappedSection from '$lib/sections/WrappedSection.svelte';
  import SafetySection from '$lib/sections/SafetySection.svelte';
  import ImmichSection from '$lib/sections/ImmichSection.svelte';
  import PackingSection from '$lib/sections/PackingSection.svelte';
  import ExpensesSection from '$lib/sections/ExpensesSection.svelte';
  import TripSettingsSection from '$lib/sections/TripSettingsSection.svelte';
  import { fmtDateRange, tripEmoji } from '$lib/format.js';
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

  const emoji = $derived(tripEmoji(trip.trip_type));
  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);

  // Post-trip phase: once the end date (UTC day) has passed — or the organizer
  // marked it completed — the page leads with the Wrapped recap (#9).
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
  // Crew dietary notes (allergies / preferences) → shown to cooks in Meals.
  const dietaryNotes = $derived(
    participants
      .filter((/** @type {any} */ p) => (p.dietary || '').trim())
      .map((/** @type {any} */ p) => ({ name: p.display_name, dietary: p.dietary }))
  );

  // dates · location · N going, joined with guaranteed spacing (Svelte collapses
  // whitespace around an inline {#if}, which would otherwise tighten the dots).
  const meta = $derived(
    [
      trip.start_date ? fmtDateRange(trip.start_date, trip.end_date) : '',
      trip.location,
      `${going} going`
    ]
      .filter(Boolean)
      .join(' · ')
  );

  // The signed-in viewer's participant on this trip (for Trip settings).
  const me = $derived.by(() => {
    const p = participants.find((/** @type {any} */ x) => x.id === currentParticipantId);
    return p ? { name: p.display_name, avatar: p.avatar, notify: p.notify } : null;
  });

  // The trip page is one scroll of `<section id>` modules under the shell's
  // contextual section nav (scrollSpy). Each live row targets a `<section>`
  // below; the dimmed "soon" rows are roadmap modules. Order + icons mirror
  // docs/apps/tripwala.md (the design repo's contextual-nav contract).
  const SECTION_NAV = [
    { key: 'overview', label: 'Overview', icon: '✨', href: '#overview' },
    { key: 'itinerary', label: 'Itinerary', icon: '🗓️', href: '#itinerary' },
    { key: 'map', label: 'Map', icon: '🗺️', href: '#map' },
    { key: 'crew', label: 'Members', icon: '🙌', href: '#crew' },
    { key: 'gear', label: 'Gear', icon: '🎒', href: '#gear' },
    { key: 'food', label: 'Food', icon: '🍳', href: '#food' },
    { key: 'packing', label: 'Packing', icon: '🧳', href: '#packing' },
    { key: 'expenses', label: 'Expenses', icon: '💸', href: '#expenses' },
    { key: 'tripsettings', label: 'Settings', icon: '⚙️', href: '#tripsettings' }
  ];

  // Sections an organizer has hidden for the whole trip (Overview + Trip settings
  // are never hideable). Drives both the nav and which `<section>`s render.
  const hidden = $derived(new Set(trip.hidden_sections ?? []));
  const isHidden = (/** @type {string} */ key) => hidden.has(key);
  // A Safety card appears (just after Overview) only when the organizer filled in
  // emergency info; a wrapped trip leads the nav with the recap.
  const hasSafety = $derived(!!(trip.emergency_info || '').trim());
  // A Photos section appears when a shared Immich album is linked (opt-in).
  const hasPhotos = $derived(!!(trip.immich_album_url || '').trim());
  const fullNav = $derived.by(() => {
    let nav = [...SECTION_NAV];
    if (isPast) {
      // Wrapped replaces Overview at the top of a past trip (Overview's content
      // is folded into the recap), so swap the lead nav row to match.
      nav = nav.filter((n) => n.key !== 'overview');
      nav.unshift({ key: 'wrapped', label: 'Wrapped', icon: '🎉', href: '#wrapped' });
    }
    if (hasSafety) {
      // Safety sits just after the lead recap/overview row.
      const leadKey = isPast ? 'wrapped' : 'overview';
      const i = nav.findIndex((n) => n.key === leadKey);
      nav.splice(i + 1, 0, { key: 'safety', label: 'Safety', icon: '🚨', href: '#safety' });
    }
    if (hasPhotos) {
      // Photos follows the lead/safety rows.
      const afterKey = hasSafety ? 'safety' : isPast ? 'wrapped' : 'overview';
      const i = nav.findIndex((n) => n.key === afterKey);
      nav.splice(i + 1, 0, { key: 'photos', label: 'Photos', icon: '📷', href: '#photos' });
    }
    return nav;
  });
  const visibleNav = $derived(fullNav.filter((n) => !hidden.has(n.key)));

  // Organizer hides a section straight from its header (restore from Trip
  // settings). Each section gets an onHide only in ownerMode; guests never do.
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

  // Per-viewer collapsed sections — folds a section's card locally for everyone
  // who clicks (doesn't hide it for others). Persisted in localStorage so it
  // survives reloads. The chevron + folding work for every viewer, organizer or
  // not — distinct from Hide, which is organizer-only and trip-wide.
  // Sections folded by default until the viewer chooses otherwise. The seed
  // marker lets us apply these once, so a later manual expand isn't re-folded on
  // the next load (and isn't forced on viewers who already have saved state).
  const DEFAULT_COLLAPSED = ['tripsettings'];
  const SEED_MARK = '__seeded_v1__';
  let collapsed = $state(new Set(DEFAULT_COLLAPSED));
  onMount(() => {
    try {
      const raw = localStorage.getItem(`tripwala:collapsed:${trip.id}`);
      const set = raw ? new Set(JSON.parse(raw)) : new Set();
      if (!set.has(SEED_MARK)) {
        for (const k of DEFAULT_COLLAPSED) set.add(k);
        set.add(SEED_MARK);
      }
      collapsed = set;
    } catch (_) {
      /* ignore corrupt/blocked storage */
    }
  });
  /** @param {string} key */
  function toggleCollapse(key) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsed = next;
    try {
      localStorage.setItem(`tripwala:collapsed:${trip.id}`, JSON.stringify([...next]));
    } catch (_) {
      /* ignore */
    }
  }

  // Publish the section nav + trip name up to the layout's AppShell, flipping it
  // into contextual mode. The kit (≥v0.3.2) diffs scrollSpy by section-set content,
  // so re-publishing on the 4s poll is harmless. Cleared on unmount.
  const shell = useShell();
  $effect(() => {
    shell.trip = { title: trip.name, subtitle: meta, emoji, nav: visibleNav };
  });
  $effect(() => () => {
    shell.trip = null;
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
     (data-appshell-sticky). Emoji tile + name + dates · where · N going. -->
<header data-appshell-sticky class="trip-head" style="background: var(--color-bg-app)">
  <div class="flex items-center gap-3">
    <span
      class="grid h-12 w-12 flex-none place-items-center rounded-md text-[26px]"
      style="background: linear-gradient(135deg, var(--color-sand-200), var(--color-sand-300))"
    >{emoji}</span>
    <div class="min-w-0">
      <h1 class="truncate font-display text-[21px] font-bold leading-tight text-cocoa-900">{trip.name}</h1>
      <div class="flex items-center gap-1.5">
        {#if isPast}
          <span class="flex-none rounded-full bg-berry-200 px-1.5 py-0.5 font-body text-[10px] font-extrabold text-berry-600">🎉 Wrapped</span>
        {/if}
        {#if meta}
          <div class="truncate font-body text-[13px] font-extrabold text-coral-600">{meta}</div>
        {/if}
      </div>
    </div>
  </div>
</header>

{#if top}{@render top()}{/if}

<div class="trip-stack">
  {#if isPast}
    <section id="wrapped" class="trip-section" class:is-collapsed={collapsed.has('wrapped')}>
      <WrappedSection {trip} {participants} {gear} {meals} expenses={data.expenses} collapsed={collapsed.has('wrapped')} onToggle={() => toggleCollapse('wrapped')} />
    </section>
  {/if}
  {#if !isPast}
    <!-- Upcoming/active: the live overview. Past trips fold this into Wrapped
         (its location photo + description live there), so it isn't shown twice. -->
    <section id="overview" class="trip-section" class:is-collapsed={collapsed.has('overview')}>
      <OverviewSection {trip} {participants} {gear} {meals} {ownerMode} {settingsHref} collapsed={collapsed.has('overview')} onToggle={() => toggleCollapse('overview')} />
    </section>
  {/if}
  {#if hasSafety}
    <section id="safety" class="trip-section" class:is-collapsed={collapsed.has('safety')}>
      <SafetySection info={trip.emergency_info} collapsed={collapsed.has('safety')} onToggle={() => toggleCollapse('safety')} />
    </section>
  {/if}
  {#if hasPhotos && !isHidden('photos')}
    <section id="photos" class="trip-section" class:is-collapsed={collapsed.has('photos')}>
      <ImmichSection url={trip.immich_album_url} onHide={hideHandler('photos')} collapsed={collapsed.has('photos')} onToggle={() => toggleCollapse('photos')} />
    </section>
  {/if}
  {#if !isHidden('itinerary')}
    <section id="itinerary" class="trip-section" class:is-collapsed={collapsed.has('itinerary')}>
      <ItinerarySection shareToken={trip.share_token} itineraryItems={data.itineraryItems ?? []} cities={data.cities ?? []} mapApp={data.mapApp ?? 'apple'} {trip} {currentParticipantId} {ownerMode} onHide={hideHandler('itinerary')} collapsed={collapsed.has('itinerary')} onToggle={() => toggleCollapse('itinerary')} />
    </section>
  {/if}
  {#if !isHidden('map')}
    <section id="map" class="trip-section" class:is-collapsed={collapsed.has('map')}>
      <MapSection shareToken={trip.share_token} {trip} mapPins={data.mapPins ?? []} {currentParticipantId} {ownerMode} onHide={hideHandler('map')} collapsed={collapsed.has('map')} onToggle={() => toggleCollapse('map')} />
    </section>
  {/if}
  {#if !isHidden('crew')}
    <section id="crew" class="trip-section" class:is-collapsed={collapsed.has('crew')}>
      <PeopleSection shareToken={trip.share_token} {participants} {currentParticipantId} {ownerMode} {isPast} invitableFriends={data.invitableFriends ?? []} inviteVisibility={trip.invite_visibility ?? 'everyone'} onHide={hideHandler('crew')} collapsed={collapsed.has('crew')} onToggle={() => toggleCollapse('crew')} />
    </section>
  {/if}
  {#if !isHidden('gear')}
    <section id="gear" class="trip-section" class:is-collapsed={collapsed.has('gear')}>
      <GearSection shareToken={trip.share_token} {gear} {currentParticipantId} onHide={hideHandler('gear')} collapsed={collapsed.has('gear')} onToggle={() => toggleCollapse('gear')} />
    </section>
  {/if}
  {#if !isHidden('food')}
    <section id="food" class="trip-section" class:is-collapsed={collapsed.has('food')}>
      <MealsSection shareToken={trip.share_token} {meals} {currentParticipantId} dietaryNotes={dietaryNotes} {trip} {ownerMode} onHide={hideHandler('food')} collapsed={collapsed.has('food')} onToggle={() => toggleCollapse('food')} />
    </section>
  {/if}
  {#if !isHidden('packing')}
    <section id="packing" class="trip-section" class:is-collapsed={collapsed.has('packing')}>
      <PackingSection shareToken={trip.share_token} packing={data.packing} {currentParticipantId} onHide={hideHandler('packing')} collapsed={collapsed.has('packing')} onToggle={() => toggleCollapse('packing')} />
    </section>
  {/if}
  {#if !isHidden('expenses')}
    <section id="expenses" class="trip-section" class:is-collapsed={collapsed.has('expenses')}>
      <ExpensesSection
        shareToken={trip.share_token}
        expenses={data.expenses}
        settlement={data.settlement}
        {currentParticipantId}
        {ownerMode}
        onHide={hideHandler('expenses')}
        collapsed={collapsed.has('expenses')}
        onToggle={() => toggleCollapse('expenses')}
      />
    </section>
  {/if}
  <section id="tripsettings" class="trip-section" class:is-collapsed={collapsed.has('tripsettings')}>
    <TripSettingsSection
      shareToken={trip.share_token}
      {ownerMode}
      {me}
      {trip}
      members={data.members ?? []}
      {currentParticipantId}
      joinPolicy={trip.join_policy}
      inviteVisibility={trip.invite_visibility}
      pending={data.pending ?? []}
      invites={data.invites ?? []}
      emailEnabled={data.emailEnabled ?? false}
      immichEnabled={data.immichEnabled ?? false}
      collapsed={collapsed.has('tripsettings')}
      onToggle={() => toggleCollapse('tripsettings')}
    />
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
    padding: 16px 0 14px;
    margin-bottom: var(--stack-gap, 14px);
    border-bottom: 1px solid var(--color-sand-300);
    /* The header background is opaque, but the margin-bottom gap below the
       border is not — so cards scrolling under the sticky header butt straight
       against the border and make its edge look ragged. Paint an opaque strip
       of the app background over that gap so the border always sits on a clean
       buffer. */
    background: var(--color-bg-app);
    box-shadow: 0 var(--stack-gap, 14px) 0 var(--color-bg-app);
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
  /* Collapsed: fold everything below the section's header (its first child). The
     header itself (with the chevron) stays so it can be re-expanded. */
  .trip-section.is-collapsed > :global(*:not(:first-child)) {
    display: none;
  }
</style>
