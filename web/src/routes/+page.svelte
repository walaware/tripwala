<script>
  import { Button, Wordmark, AppIcon } from '@walaware/design';
  import TripCard from '$lib/TripCard.svelte';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const trips = $derived(data.trips);
  const total = $derived(
    trips ? trips.current.length + trips.upcoming.length + trips.past.length : 0
  );
  const coming = $derived(trips ? trips.current.length + trips.upcoming.length : 0);
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
      {#each [{ items: trips.current, label: 'Happening now' }, { items: trips.upcoming, label: 'Upcoming' }, { items: trips.past, label: 'Past' }] as section}
        {#if section.items.length}
          <section class="mt-8">
            <h2 class="mb-3.5 font-display text-[13px] font-extrabold uppercase tracking-wider text-text-muted">
              {section.label}
            </h2>
            <div class="flex flex-col gap-3 sm:grid sm:grid-cols-2">
              {#each section.items as trip (trip.id)}
                <TripCard {trip} />
              {/each}
            </div>
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
