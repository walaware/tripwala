<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { Card, Switch, Button } from '@walaware/design';
  import { tripAction } from '$lib/tripClient.js';
  import { useShell } from '$lib/shell.svelte.js';
  import { tripSectionNav } from '$lib/tripSections.js';
  import { tripEmoji, tripTypeLabel } from '$lib/format.js';
  import { tripHeroSrc } from '$lib/tripHero.js';
  import { heroDefaultSrc } from '$lib/heroDefaults.js';
  import SettingRow from '$lib/sections/settings/SettingRow.svelte';
  import InviteAccess from '$lib/sections/settings/InviteAccess.svelte';
  import TripDetailsForm from '$lib/sections/settings/TripDetailsForm.svelte';
  import PeopleRoles from '$lib/sections/settings/PeopleRoles.svelte';
  import StageSections from '$lib/sections/settings/StageSections.svelte';
  import { confirmAction } from '$lib/confirm.svelte.js';

  /** @type {{ data: any, form?: any }} */
  let { data, form } = $props();

  const trip = $derived(data.trip);
  const shareToken = $derived(data.shareToken);
  const ownerMode = $derived(data.isOrganizer ?? false);
  const me = $derived(data.me);
  // People management (organizer only — loader returns [] for guests).
  const members = $derived(data.members ?? []);
  const pending = $derived(data.pending ?? []);
  const invites = $derived(data.invites ?? []);
  const currentParticipantId = $derived(data.currentParticipantId ?? null);
  const emailEnabled = $derived(data.emailEnabled ?? false);

  const notifyOn = $derived(me?.notify !== false);
  // Preview shows the same resolution the trip page will use, so what you see
  // here is what the banner shows — including the generated per-type fallback.
  const heroSrc = $derived(tripHeroSrc(trip, heroDefaultSrc(trip.trip_type)));

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
      { key: 'gear', icon: '🎒', label: 'Gear', on: "The group's list & your pack", off: "The group's list & your pack" },
      { key: 'food', icon: '🍳', label: 'Food', on: "Meals & who's cooking", off: "Meals & who's cooking" },
      { key: 'expenses', icon: '💸', label: 'Expenses', on: 'Who paid what?', off: 'Shared costs & settle-up' },
      ...((trip.photo_album_url || '').trim()
        ? [{ key: 'photos', icon: '📷', label: 'Photos', on: 'Shared album', off: 'Shared album' }]
        : [])
    ]
  );
  const hidden = $derived(new Set(trip.hidden_sections ?? []));

  let busy = $state('');
  // Brief "Saved" pulse after a trip-details edit (mirrors TripSettingsSection).
  let savedFlash = $state(false);
  let cloning = $state(false);

  /** @param {string} op @param {Record<string, unknown>} payload @param {string} [tag] */
  async function act(op, payload = {}, tag = op) {
    if (busy) return;
    busy = tag;
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
      if (op === 'trip_update') {
        savedFlash = true;
        setTimeout(() => (savedFlash = false), 1500);
      }
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  // Trip actions (mirror TripSettingsSection so behavior matches the planning
  // canvas). Leave/delete bounce home; both confirm first.
  async function leave() {
    if (busy) return;
    if (!(await confirmAction({ title: 'Leave this trip?', message: 'You can re-join later from the invite link.', confirmLabel: 'Leave' }))) return;
    busy = 'leave';
    try {
      await tripAction(shareToken, { op: 'leave_trip' });
      await goto('/');
    } catch (_) {
      busy = '';
    }
  }

  /** @param {string} status */
  async function setStage(status) {
    if (busy || status === (trip.status || 'confirmed')) return;
    if (status === 'idea' && !(await confirmAction({ title: 'Move back to Ideas?', message: 'Everything is kept — it just leaves the calendar until you promote it again.', confirmLabel: 'Move to Ideas' }))) return;
    await act('set_status', { status }, 'stage');
  }

  async function deleteTrip() {
    if (busy) return;
    if (!(await confirmAction({ title: `Delete "${trip.name}"?`, message: "This permanently removes the itinerary, gear, expenses, photo links and everyone's data for this trip. This can't be undone.", confirmLabel: 'Delete trip', danger: true }))) return;
    busy = 'delete';
    try {
      await tripAction(shareToken, { op: 'delete_trip' });
      await goto('/');
    } catch (_) {
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

  <!-- ✏️ Trip details — name, dates, location, description, safety (organizer). -->
  {#if ownerMode}
    <div class={groupLabel}>✏️ Trip details</div>
    <Card>
      <TripDetailsForm {shareToken} {trip} {busy} {savedFlash} {act} />
    </Card>
  {/if}

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

  <!-- 🖼️ Trip photo — the cover shown on the trip banner and everyone's dashboard -->
  {#if ownerMode}
    <div class={groupLabel}>🖼️ Trip photo</div>
    <Card>
      <div class="relative mb-3 h-[108px] overflow-hidden rounded-lg bg-sand-200">
        {#if heroSrc}
          <img src={heroSrc} alt="" class="h-full w-full object-cover" />
        {:else}
          <div class="grid h-full place-items-center font-body text-[12.5px] font-bold text-text-muted">
            No photo yet
          </div>
        {/if}
      </div>

      {#if form?.heroError}
        <p class="mb-2 font-body text-[12.5px] font-extrabold text-berry-600">{form.heroError}</p>
      {/if}

      <div class="flex flex-wrap items-center gap-2">
        <form method="POST" action="?/heroImage" enctype="multipart/form-data" use:enhance>
          <input
            type="file" name="hero" accept="image/*" id="hero-file" class="sr-only"
            onchange={(e) => /** @type {HTMLInputElement} */ (e.currentTarget).form?.requestSubmit()}
          />
          <label
            for="hero-file"
            class="cursor-pointer rounded-full border-2 border-sand-300 px-3 py-1.5 font-body text-[12.5px] font-extrabold text-cocoa-700 hover:border-coral-300"
          >{trip.heroImage ? 'Replace photo' : 'Upload a photo'}</label>
        </form>

        {#if trip.heroImage}
          <form method="POST" action="?/removeHeroImage" use:enhance>
            <button type="submit" class="rounded-full px-3 py-1.5 font-body text-[12.5px] font-extrabold text-berry-600 hover:bg-berry-200">
              Remove
            </button>
          </form>
        {/if}
      </div>

      <p class="mt-2 font-body text-[12px] font-bold text-text-muted">
        Wide shots work best — it crops to a low strip. Without one, the trip uses the
        photo of the spot you picked, then artwork for a {tripTypeLabel(trip.trip_type).toLowerCase()}.
      </p>
    </Card>
  {/if}

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

  <!-- 🙌 People & roles — organizers manage members, pending requests, invites. -->
  {#if ownerMode}
    <div class={groupLabel}>🙌 People & roles</div>
    <Card>
      <PeopleRoles {members} {pending} {invites} {currentParticipantId} {emailEnabled} {busy} {act} />
    </Card>
  {/if}

  <!-- 🔒 Friends'-calendar privacy — who sees this trip on their shared calendar. -->
  {#if ownerMode}
    <div class={groupLabel}>🔒 Friends' calendars</div>
    <Card>
      <div class="mb-1.5 font-body text-[13px] font-extrabold text-text-strong">What friends see on their calendar</div>
      <InviteAccess {ownerMode} visibility={trip.visibility} {act} />
    </Card>
  {/if}

  <!-- 📋 Trip actions — any member can clone or leave (they moved here when the
       header ⋯ menu was retired). -->
  <div class={groupLabel}>📋 Trip actions</div>
  <Card>
    {#if form?.cloneError}
      <p class="mb-2 font-body text-[12.5px] font-extrabold text-berry-600">{form.cloneError}</p>
    {/if}
    <form
      method="POST"
      action="?/clone"
      use:enhance={() => {
        cloning = true;
        return async ({ update }) => {
          await update();
          cloning = false;
        };
      }}
    >
      <SettingRow icon="📋" title="Duplicate this trip" desc="Copy the gear, packing & meals into a new trip you own" first>
        {#snippet control()}
          <Button type="submit" variant="soft" size="sm" disabled={cloning}>{cloning ? 'Copying…' : 'Make a copy'}</Button>
        {/snippet}
      </SettingRow>
    </form>

    <SettingRow icon="🚪" title="Leave this trip" desc="You'll stop getting updates — re-join later from the invite link">
      {#snippet control()}
        <Button variant="ghost" size="sm" disabled={busy === 'leave'} onclick={leave}>Leave</Button>
      {/snippet}
    </SettingRow>
  </Card>

  <!-- 🗂️ Stage & danger zone — move the trip through its lifecycle, or delete it
       (organizer). Hidden-section restore is handled by the Sections toggles
       above, so this only carries stage + delete (hiddenList empty). -->
  {#if ownerMode}
    <div class={groupLabel}>🗂️ Stage</div>
    <Card>
      <StageSections {trip} hiddenList={[]} {busy} {act} onSetStage={setStage} onDelete={deleteTrip} />
    </Card>
  {/if}
</div>
