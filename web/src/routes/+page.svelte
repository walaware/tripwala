<script>
  import { Button, Wordmark, AppIcon, RequestCard } from '@walaware/design';
  import { applyAction, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import TripCard from '$lib/TripCard.svelte';
  import { fmtDateRange } from '$lib/format.js';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const trips = $derived(data.trips);
  const invitations = $derived(data.invitations ?? []);

  // Drive the design components' callbacks through the page's form actions.
  /** @param {string} action @param {Record<string,string>} fields */
  async function submitAction(action, fields) {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    const res = await fetch(`/?/${action}`, { method: 'POST', body });
    /** @type {any} */
    const result = deserialize(await res.text());
    if (result.type === 'redirect') {
      window.location.href = result.location;
      return;
    }
    await applyAction(result);
    await invalidateAll();
  }

  /** @param {any} inv */
  const inviteMeta = (inv) =>
    [fmtDateRange(inv.trip.start_date, inv.trip.end_date), inv.trip.location, inv.invitedBy ? `from ${inv.invitedBy}` : '']
      .filter(Boolean)
      .join(' · ');
  const total = $derived(
    trips ? trips.current.length + trips.upcoming.length + trips.past.length : 0
  );
  const coming = $derived(trips ? trips.current.length + trips.upcoming.length : 0);

  // Past trips pile up and aren't the point of the page, so collapse them to a
  // single preview row (most-recent first) with a tap to reveal the rest.
  const PAST_PREVIEW = 2;
  let pastExpanded = $state(false);
</script>

<svelte:head><title>tripwala — one link, everyone's in</title></svelte:head>

{#if data.user}
  <!-- Dashboard — AppShell owns the padding + centered content column. -->
  <div>
    <div class="flex items-start justify-between gap-3 border-b border-sand-300 pb-4">
      <div>
        <h1 class="font-display text-[27px] font-bold tracking-tight text-text-strong">Your trips</h1>
        {#if total > 0}
          <p class="mt-0.5 font-body text-[15px] font-bold text-text-muted">
            {coming} trip{coming === 1 ? '' : 's'} coming up.
          </p>
        {/if}
      </div>
      <Button href="/new" variant="primary" size="md">＋ New trip</Button>
    </div>

    {#if invitations.length}
      <section class="mt-6">
        <h2 class="mb-3 font-display text-[13px] font-extrabold uppercase tracking-wider text-text-muted">
          Invitations
        </h2>
        <div class="flex flex-col gap-3">
          {#each invitations as inv (inv.id)}
            <RequestCard
              emoji="🧭"
              title={inv.trip.name}
              meta={inviteMeta(inv)}
              acceptLabel="Join"
              onAccept={() => submitAction('acceptInvite', { id: inv.id })}
              onDecline={() => submitAction('declineInvite', { id: inv.id })}
            />
          {/each}
        </div>
      </section>
    {/if}

    {#if total === 0}
      <div class="mt-8 rounded-2xl bg-surface-card p-8 text-center shadow-card">
        <div class="text-[44px] leading-none">🧭</div>
        <h2 class="mt-2 font-display text-xl font-bold text-text-strong">No trips planned yet</h2>
        <p class="mx-auto mt-1 max-w-sm font-body font-bold text-text-muted">
          Plan one and share the link, or open an invite someone sent you — it'll show up here.
        </p>
        <div class="mt-5"><Button href="/new" variant="primary" size="lg">Plan your first trip 🎒</Button></div>
      </div>
    {:else if trips}
      {#each [{ id: 'current', items: trips.current, label: 'Happening now' }, { id: 'upcoming', items: trips.upcoming, label: 'Upcoming' }, { id: 'past', items: trips.past, label: 'Past' }] as section}
        {#if section.items.length}
          {@const collapsible = section.id === 'past' && section.items.length > PAST_PREVIEW}
          {@const hidden = collapsible && !pastExpanded ? section.items.length - PAST_PREVIEW : 0}
          {@const visible = hidden ? section.items.slice(0, PAST_PREVIEW) : section.items}
          <section class="mt-8">
            <h2 class="mb-5 font-display text-[13px] font-extrabold uppercase tracking-wider text-text-muted">
              {section.label}
            </h2>
            <div class="flex flex-col gap-3 sm:grid sm:grid-cols-2">
              {#each visible as trip (trip.id)}
                <TripCard {trip} />
              {/each}
            </div>
            {#if collapsible}
              <button
                type="button"
                onclick={() => (pastExpanded = !pastExpanded)}
                aria-expanded={pastExpanded}
                class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-sand-300 py-2.5 font-body text-[13px] font-extrabold text-text-muted transition-colors hover:bg-surface-sunk"
              >
                {#if pastExpanded}
                  Show less <span class="text-[10px]">▲</span>
                {:else}
                  Show {hidden} more past trip{hidden === 1 ? '' : 's'} <span class="text-[10px]">▼</span>
                {/if}
              </button>
            {/if}
          </section>
        {/if}
      {/each}
    {/if}
  </div>
{:else}
  <!-- Marketing landing — full-bleed, responsive (rendered outside the app shell). -->
  <main
    class="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-sand-100 to-sand-200 px-6 py-20 text-center sm:py-28"
  >
    <div class="mx-auto w-full max-w-2xl">
      <div class="flex flex-col items-center gap-4">
        <AppIcon app="tripwala" size={76} />
        <Wordmark root="trip" size={56} />
      </div>
      <p class="mx-auto mt-5 max-w-xl font-body text-lg font-bold text-text-body sm:text-xl">
        One link where the group gathers. Plan a trip, drop it in the group chat, and
        everyone signs in to join — RSVP, grab gear, sign up for food. Private to the
        people you invite.
      </p>

      <div class="mx-auto mt-8 flex max-w-xs flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Button href="/new" variant="primary" size="lg" full class="sm:w-auto">Plan a trip 🎒</Button>
        <Button href="/login" variant="ghost" size="lg" full class="sm:w-auto">Sign in →</Button>
      </div>
    </div>
  </main>
{/if}
