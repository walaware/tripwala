<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { Card, Switch } from '@walaware/design';
  import { tripAction } from '$lib/tripClient.js';
  import { useShell } from '$lib/shell.svelte.js';
  import { tripSectionNav } from '$lib/tripSections.js';
  import { tripEmoji } from '$lib/format.js';
  import SettingRow from '$lib/sections/settings/SettingRow.svelte';
  import InviteAccess from '$lib/sections/settings/InviteAccess.svelte';

  /** @type {{ data: any }} */
  let { data } = $props();

  const trip = $derived(data.trip);
  const shareToken = $derived(data.shareToken);
  const ownerMode = $derived(data.isOrganizer ?? false);
  const me = $derived(data.me);

  const notifyOn = $derived(me?.notify !== false);

  // Keep the AppShell in the trip's CONTEXTUAL mode while on Trip settings —
  // entering settings shouldn't dump the user back to the app-level global nav.
  // back → the trip; nav = the trip's section nav (absolute links into the trip
  // route + section, since settings is its own route); scrollSpy off.
  const shell = useShell();
  $effect(() => {
    shell.trip = {
      title: '⚙️ Trip settings',
      subtitle: trip.name,
      emoji: tripEmoji(trip.trip_type),
      nav: tripSectionNav(trip, `/${shareToken}`),
      scrollSpy: false,
      back: { label: trip.name, onClick: () => goto(`/${shareToken}`) }
    };
  });
  $effect(() => () => {
    shell.trip = null;
  });

  // Every hideable module on the trip page (Overview + Trip settings are never
  // hideable; Photos only appears once an album is linked). The 🧩 Sections
  // group is the restore-hidden-sections surface — it syncs with each module's
  // ⋯ "Hide this section". Keys match TripView's isHidden() / hidden_sections.
  const MODULES = $derived(
    [
      { key: 'itinerary', icon: '🗓️', label: 'Itinerary', on: "What's the plan?", off: 'The day-by-day plan' },
      { key: 'bookings', icon: '🎫', label: 'Bookings', on: "What's booked?", off: 'Flights, stays & tickets' },
      { key: 'map', icon: '🗺️', label: 'Map', on: 'Pins & places', off: 'Pins & places' },
      { key: 'crew', icon: '🙌', label: 'Members', on: "Who's coming", off: 'RSVPs & the crew' },
      { key: 'gear', icon: '🎒', label: 'Gear', on: 'Shared gear to grab', off: 'Shared gear to grab' },
      { key: 'food', icon: '🍳', label: 'Food', on: "Meals & who's cooking", off: "Meals & who's cooking" },
      { key: 'packing', icon: '🧳', label: 'Packing', on: 'Personal packing list', off: 'Personal packing list' },
      { key: 'expenses', icon: '💸', label: 'Expenses', on: 'Who paid what?', off: 'Shared costs & settle-up' },
      ...((trip.immich_album_url || '').trim()
        ? [{ key: 'photos', icon: '📷', label: 'Photos', on: 'Shared album', off: 'Shared album' }]
        : [])
    ]
  );
  const hidden = $derived(new Set(trip.hidden_sections ?? []));

  let busy = $state('');

  /** @param {string} op @param {Record<string, unknown>} payload @param {string} [tag] */
  async function act(op, payload = {}, tag = op) {
    if (busy) return;
    busy = tag;
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  /** @param {string} key @param {boolean} isHidden */
  const toggleSection = (key, isHidden) =>
    act(isHidden ? 'section_show' : 'section_hide', { key }, 'sec-' + key);

  const groupLabel = 'mb-2 mt-6 px-1 font-body text-[11px] font-extrabold uppercase tracking-wide text-text-muted';
</script>

<svelte:head><title>Trip settings — tripwala</title></svelte:head>

<div class="mx-auto max-w-[640px]">
  <a href="/{shareToken}" class="font-body text-sm font-extrabold text-coral-600 hover:underline">← Back to trip</a>
  <h1 class="mt-2 font-display text-[27px] font-bold tracking-tight text-text-strong">⚙️ Trip settings</h1>
  <p class="mt-1 font-body text-[14px] font-bold text-text-muted">Everything about {trip.name}, in one place.</p>

  <!-- 🧩 Sections — what this trip shows -->
  <div class={groupLabel}>🧩 Sections — what this trip shows</div>
  <Card>
    {#each MODULES as m, i (m.key)}
      {@const isHidden = hidden.has(m.key)}
      <SettingRow icon={m.icon} title={m.label} desc={isHidden ? 'Hidden from the trip page' : m.on} first={i === 0}>
        {#snippet control()}
          <Switch
            checked={!isHidden}
            ariaLabel="Show {m.label} on the trip page"
            disabled={busy === 'sec-' + m.key}
            onChange={() => toggleSection(m.key, isHidden)}
          />
        {/snippet}
      </SettingRow>
    {/each}
    <p class="mt-2.5 font-body text-[12px] font-bold text-text-muted">
      Hidden sections leave the trip page and its nav — flip them back anytime.
    </p>
  </Card>

  <!-- 🔔 Your notifications -->
  <div class={groupLabel}>🔔 Your notifications</div>
  <Card>
    <SettingRow icon="🔔" title="Trip notifications" desc="Claims, RSVPs and meal updates — just for you" first>
      {#snippet control()}
        <Switch
          checked={notifyOn}
          ariaLabel="Trip notifications"
          disabled={busy === 'notify_toggle'}
          onChange={() => act('notify_toggle')}
        />
      {/snippet}
    </SettingRow>
  </Card>

  <!-- 🔒 Friends'-calendar privacy — the only access control that stays here;
       join/share policy live in the invite modal, roles under "Who's in", and
       trip actions (edit/clone/leave/…) in the trip-header ⋯ menu. -->
  {#if ownerMode}
    <div class={groupLabel}>🔒 Friends' calendars</div>
    <Card>
      <div class="mb-1.5 font-body text-[13px] font-extrabold text-text-strong">What friends see on their calendar</div>
      <InviteAccess {ownerMode} visibility={trip.visibility} {act} />
    </Card>
  {/if}
</div>
