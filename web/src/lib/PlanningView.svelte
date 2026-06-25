<script>
  import { invalidateAll } from '$app/navigation';
  import { Avatar, Chip, Card, Button, DateField } from '@walaware/design';
  import PlanDateSection from '$lib/sections/PlanDateSection.svelte';
  import PlanLocationSection from '$lib/sections/PlanLocationSection.svelte';
  import TripSettingsSection from '$lib/sections/TripSettingsSection.svelte';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { planAction } from '$lib/planClient.js';
  import { tripEmoji } from '$lib/format.js';
  import { useShell } from '$lib/shell.svelte.js';

  /** @type {{ data: any }} */
  let { data } = $props();

  const trip = $derived(data.trip);
  const isOrganizer = $derived(data.isOrganizer);
  const participants = $derived(data.participants ?? []);
  const emoji = $derived(tripEmoji(trip.trip_type));

  // Planning uses the same contextual shell as a confirmed trip — a section nav
  // over one scrollable page. (Dates/Where are voting modules, not the read-only
  // confirmed ones.)
  const PLAN_NAV = [
    { key: 'overview', label: 'The Plan', icon: '📋', href: '#overview' },
    { key: 'dates', label: 'Dates', icon: '📅', href: '#dates' },
    { key: 'where', label: 'Where', icon: '📍', href: '#where' },
    { key: 'crew', label: "Who's in", icon: '🙌', href: '#crew' },
    { key: 'tripsettings', label: 'Trip settings', icon: '⚙️', href: '#tripsettings' }
  ];
  const shell = useShell();
  const subtitle = $derived(
    'In planning' + (participants.length ? ` · ${participants.length} interested` : '')
  );
  $effect(() => {
    shell.trip = { title: trip.name, subtitle, emoji, nav: PLAN_NAV };
  });
  $effect(() => () => {
    shell.trip = null;
  });

  // Suggest the most-popular proposed range to prefill the confirm form.
  const suggested = $derived(
    [...(data.dateOptions ?? [])].sort((a, b) => b.yes - a.yes || a.start_date.localeCompare(b.start_date))[0]
  );
  let cStart = $state('');
  let cEnd = $state('');
  let cLoc = $state('');
  let confirming = $state(false);
  let confirmErr = $state('');
  let showConfirm = $state(false);

  function openConfirm() {
    cStart = (suggested?.start_date ?? '').slice(0, 10);
    cEnd = (suggested?.end_date ?? suggested?.start_date ?? '').slice(0, 10);
    cLoc = trip.location ?? '';
    showConfirm = true;
  }

  async function confirmTrip() {
    if (!cStart || confirming) return;
    confirming = true;
    confirmErr = '';
    try {
      await planAction(trip.share_token, { op: 'confirm_trip', start: cStart, end: cEnd || cStart, location: cLoc });
      await invalidateAll(); // status → confirmed; page swaps to the full trip
    } catch (_) {
      confirmErr = 'Could not confirm — check the dates.';
      confirming = false;
    }
  }

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-2.5 font-body text-sm font-bold text-cocoa-900 outline-none focus:border-coral-400';
</script>

<!-- Sticky header (data-appshell-sticky) — emoji tile + name + planning status. -->
<header data-appshell-sticky class="trip-head" style="background: var(--color-bg-app)">
  <div class="flex items-center gap-3">
    <span
      class="grid h-12 w-12 flex-none place-items-center rounded-md text-[26px]"
      style="background: linear-gradient(135deg, var(--color-sand-200), var(--color-sand-300))"
    >{emoji}</span>
    <div class="min-w-0">
      <h1 class="truncate font-display text-[21px] font-bold leading-tight text-cocoa-900">{trip.name}</h1>
      <div class="truncate font-body text-[13px] font-extrabold text-coral-600">
        🌱 In planning{#if participants.length} · {participants.length} interested{/if}
      </div>
    </div>
  </div>
</header>

<div class="trip-stack">
  <section id="overview" class="trip-section">
    <SectionHeader emoji="📋" title="The Plan" />
    <Card>
      <!-- Status, interested count and trip type live in the sticky header (and the
           emoji tile) — don't repeat them here. The Overview is for the plan itself. -->
      {#if trip.description}
        <div class="rounded-2xl bg-sand-100 p-4 font-body text-[13.5px] leading-relaxed text-cocoa-700 [&_a]:font-extrabold [&_a]:text-coral-700 [&_a]:underline [&_a]:underline-offset-2">
          {@html trip.description}
        </div>
      {:else}
        <p class="font-body text-[13.5px] font-bold text-cocoa-500">
          🌱 Still gathering ideas — vote on dates and places below to help lock it in.
        </p>
      {/if}

      {#if isOrganizer}
        <div class="mt-3.5 border-t border-sand-200 pt-3.5">
          {#if !showConfirm}
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-display text-[15px] font-semibold text-cocoa-900">Ready to lock it in?</div>
                <div class="font-body text-[13px] font-bold text-cocoa-500">Set the final dates and it becomes a real trip.</div>
              </div>
              <Button variant="primary" size="md" onclick={openConfirm}>Set the dates →</Button>
            </div>
          {:else}
            <div class="font-display text-[15px] font-semibold text-cocoa-900">Confirm the trip</div>
            <div class="mt-3">
              <DateField range bind:start={cStart} bind:end={cEnd} startLabel="Start" endLabel="End" minNights={trip.min_nights} />
            </div>
            <label class="mt-2 block">
              <span class="font-body text-[11px] font-extrabold uppercase text-cocoa-500">Location</span>
              <input bind:value={cLoc} placeholder="Where to?" class="{inputClass} mt-1" />
            </label>
            {#if confirmErr}<p class="mt-2 font-body text-sm font-bold text-berry-600">{confirmErr}</p>{/if}
            <div class="mt-3 flex gap-2">
              <Button variant="primary" size="md" onclick={confirmTrip} disabled={!cStart || confirming}>
                {confirming ? 'Confirming…' : 'Confirm 🎉'}
              </Button>
              <Button variant="ghost" size="md" onclick={() => (showConfirm = false)}>Cancel</Button>
            </div>
          {/if}
        </div>
      {/if}
    </Card>
  </section>

  <section id="dates" class="trip-section">
    <PlanDateSection
      shareToken={trip.share_token}
      dateOptions={data.dateOptions ?? []}
      availability={data.availability}
      {isOrganizer}
      minNights={trip.min_nights ?? 0}
    />
  </section>
  <section id="where" class="trip-section">
    <PlanLocationSection
      shareToken={trip.share_token}
      locations={data.locations ?? []}
      {isOrganizer}
      pickedLabel={trip.location ?? ''}
    />
  </section>

  <section id="crew" class="trip-section">
    <SectionHeader emoji="🙌" title="Who's in">
      {#snippet action()}
        <Chip tone="berry">{participants.length} interested</Chip>
      {/snippet}
    </SectionHeader>
    <Card>
      {#if participants.length}
        <div class="flex flex-wrap gap-2">
          {#each participants as p (p.id)}
            <span class="flex items-center gap-1.5 rounded-full bg-sand-100 py-1 pl-1 pr-3">
              <Avatar name={p.display_name} src={p.avatar} size={26} />
              <span class="font-body text-[13px] font-extrabold text-cocoa-900">{p.display_name}</span>
            </span>
          {/each}
        </div>
      {:else}
        <p class="font-body text-[13.5px] font-bold text-cocoa-500">Nobody's claimed a spot yet — share the link!</p>
      {/if}
    </Card>
  </section>

  <section id="tripsettings" class="trip-section">
    <TripSettingsSection
      shareToken={trip.share_token}
      ownerMode={isOrganizer}
      me={data.me}
      {trip}
      members={data.members ?? []}
      currentParticipantId={data.membership?.participantId ?? null}
      showSections={false}
      joinPolicy={trip.join_policy}
      inviteVisibility={trip.invite_visibility}
      pending={data.pending ?? []}
      emailEnabled={data.emailEnabled ?? false}
    />
  </section>
</div>

<style>
  .trip-head {
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 16px 0 14px;
    margin-bottom: var(--stack-gap, 14px);
    border-bottom: 1px solid var(--color-sand-300);
  }
  .trip-stack {
    display: flex;
    flex-direction: column;
    gap: var(--stack-gap, 14px);
  }
  .trip-section {
    scroll-margin-top: 120px;
  }
</style>
