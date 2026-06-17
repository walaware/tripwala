<script>
  import { fmtDate, fmtDateRange } from '$lib/format.js';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();
  const trip = $derived(data.trip);
  const participants = $derived(data.participants);
  const gear = $derived(data.gear);
  const meals = $derived(data.meals);

  /** @type {Record<string, string>} */
  const rsvpStyles = {
    going: 'bg-green-100 text-green-800',
    maybe: 'bg-amber-100 text-amber-800',
    out: 'bg-stone-200 text-stone-600'
  };
  /** @type {Record<string, string>} */
  const rsvpLabel = { going: 'Going', maybe: 'Maybe', out: 'Out' };

  const personalPacking = $derived(data.packing.filter((p) => !p.is_shared));
  const sharedPacking = $derived(data.packing.filter((p) => p.is_shared));
</script>

<svelte:head><title>{trip.name} — Rally</title></svelte:head>

<main class="mx-auto max-w-2xl px-4 pb-24 pt-6 sm:px-6">
  <!-- Trip header -->
  <header class="rounded-2xl bg-rally-700 px-5 py-6 text-white shadow-sm sm:px-7 sm:py-8">
    <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{trip.name}</h1>
    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-rally-100">
      {#if trip.location}<span>📍 {trip.location}</span>{/if}
      {#if trip.start_date}<span>🗓 {fmtDateRange(trip.start_date, trip.end_date)}</span>{/if}
    </div>
    {#if trip.description}
      <div class="prose-sm mt-3 text-rally-50/90">{@html trip.description}</div>
    {/if}
    {#if trip.expense_link}
      <a href={trip.expense_link} target="_blank" rel="noopener"
        class="mt-3 inline-block text-sm font-medium text-white underline underline-offset-2">
        Split expenses ↗
      </a>
    {/if}
  </header>

  <!-- RSVP -->
  <section class="mt-6">
    <h2 class="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">
      Who's coming · {participants.length}
    </h2>
    <ul class="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
      {#each participants as p}
        <li class="flex items-center justify-between px-5 py-3">
          <span class="font-medium">{p.display_name}</span>
          <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold {rsvpStyles[p.rsvp_status] ?? 'bg-stone-100 text-stone-500'}">
            {rsvpLabel[p.rsvp_status] ?? 'No reply'}
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <!-- Gear -->
  <section class="mt-6">
    <h2 class="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Gear</h2>
    <ul class="space-y-2">
      {#each gear as g}
        <li class="rounded-2xl bg-white px-5 py-3 shadow-sm">
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-medium">{g.name}</span>
            {#if g.remaining === 0}
              <span class="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Covered</span>
            {:else}
              <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {g.remaining} of {g.qty_needed} needed
              </span>
            {/if}
          </div>
          {#if g.category}<p class="text-xs text-stone-400">{g.category}</p>{/if}
          {#if g.claims.length}
            <p class="mt-1 text-sm text-stone-500">
              Claimed by {g.claims.map((c) => c.participantName).join(', ')}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <!-- Meals -->
  <section class="mt-6">
    <h2 class="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Meals</h2>
    <ul class="space-y-2">
      {#each meals as m}
        <li class="rounded-2xl bg-white px-5 py-3 shadow-sm">
          <div class="flex items-baseline justify-between">
            <span class="font-medium">{m.label}</span>
            <span class="text-xs text-stone-400">{fmtDate(m.date)}</span>
          </div>
          {#if m.signups.length}
            <ul class="mt-1 space-y-0.5 text-sm text-stone-600">
              {#each m.signups as s}
                <li>{s.participantName}{#if s.dish_note} — {s.dish_note}{/if}</li>
              {/each}
            </ul>
          {:else}
            <p class="mt-1 text-sm italic text-stone-400">No one signed up yet</p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <!-- Packing -->
  <section class="mt-6">
    <h2 class="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Packing</h2>
    {#if sharedPacking.length}
      <p class="mb-1 px-1 text-xs font-medium text-stone-400">Shared</p>
      <ul class="mb-3 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {#each sharedPacking as p}
          <li class="flex items-center gap-3 px-5 py-2.5">
            <span class="text-lg">{p.checked ? '✅' : '⬜️'}</span>
            <span class:line-through={p.checked} class:text-stone-400={p.checked}>{p.label}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if personalPacking.length}
      <p class="mb-1 px-1 text-xs font-medium text-stone-400">Personal</p>
      <ul class="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {#each personalPacking as p}
          <li class="flex items-center gap-3 px-5 py-2.5">
            <span class="text-lg">{p.checked ? '✅' : '⬜️'}</span>
            <span class="flex-1" class:line-through={p.checked} class:text-stone-400={p.checked}>{p.label}</span>
            {#if p.participantName}<span class="text-xs text-stone-400">{p.participantName}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <p class="mt-8 text-center text-xs text-stone-400">
    Read-only preview · RSVP, claims, and check-offs become interactive in the next steps.
  </p>
</main>
