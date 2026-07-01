<script>
  import { Chip, Avatar, AvatarGroup, Button } from '@walaware/design';
  import { enhance } from '$app/forms';
  import { fmtDateRange, tripEmoji } from '$lib/format.js';

  /**
   * @type {{
   *   trip: {
   *     name: string, slug: string, location?: string, trip_type?: string,
   *     start_date?: string, end_date?: string,
   *     role?: string, status?: string, going?: number, maybe?: number, members?: number,
   *     crew?: Array<{ name: string, avatar?: string }>,
   *     people?: Array<{ name: string, src?: string }>,
   *     _bucket?: 'current' | 'upcoming' | 'past'
   *   },
   *   variant?: 'trip' | 'idea'
   * }}
   */
  let { trip, variant = 'trip' } = $props();

  const isIdea = $derived(variant === 'idea');
  const planning = $derived(trip.status === 'planning');
  // Past trips read in the past tense: "6 went" rather than "6 going".
  const isPast = $derived(trip._bucket === 'past');
  const emoji = $derived(tripEmoji(trip.trip_type));
  const meta = $derived(
    isIdea
      ? (trip.location ?? '')
      : [trip.start_date ? fmtDateRange(trip.start_date, trip.end_date) : '', trip.location]
          .filter(Boolean)
          .join(' · ')
  );
</script>

{#if isIdea}
  <!-- Idea card: not a whole-card anchor, so the promote form can nest cleanly. -->
  <div class="rounded-2xl bg-surface-card p-[18px] shadow-card transition hover:shadow-pop">
    <a href="/{trip.slug}" class="block transition hover:-translate-y-0.5">
      <div class="flex items-center gap-3">
        <span
          class="grid h-[52px] w-[52px] flex-none place-items-center rounded-md text-[28px]"
          style="background: linear-gradient(135deg, var(--color-sand-200), var(--color-sand-300))"
        >{emoji}</span>
        <div class="min-w-0 flex-1">
          <h3 class="truncate font-display text-[18px] font-semibold leading-tight text-text-strong">{trip.name}</h3>
          {#if meta}
            <div class="truncate font-body text-[13px] font-extrabold text-cocoa-500">{meta}</div>
          {/if}
        </div>
        <Chip tone="coral">💭 Someday</Chip>
      </div>
    </a>

    <div class="mt-3.5 flex items-center gap-2">
      {#if trip.people?.length}
        <AvatarGroup people={trip.people} size={28} max={5} />
      {/if}
      {#if trip.role === 'organizer'}
        <form method="POST" action="?/promote" use:enhance class="ml-auto">
          <input type="hidden" name="slug" value={trip.slug} />
          <Button type="submit" variant="soft" size="sm">Promote to trip</Button>
        </form>
      {/if}
    </div>
  </div>
{:else}
  <a
    href="/{trip.slug}"
    class="block rounded-2xl bg-surface-card p-[18px] shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
  >
    <div class="flex items-center gap-3">
      <span
        class="grid h-[52px] w-[52px] flex-none place-items-center rounded-md text-[28px]"
        style="background: linear-gradient(135deg, var(--color-sand-200), var(--color-sand-300))"
      >{emoji}</span>
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-display text-[18px] font-semibold leading-tight text-text-strong">{trip.name}</h3>
        {#if meta}
          <div class="truncate font-body text-[13px] font-extrabold text-coral-600">{meta}</div>
        {/if}
      </div>
      {#if trip.role === 'organizer'}
        <span class="shrink-0 self-start rounded-full bg-sun-200 px-2 py-0.5 font-body text-[11px] font-extrabold text-cocoa-700">
          ✨ organizer
        </span>
      {/if}
    </div>

    <div class="mt-3.5 flex items-center gap-2">
      {#if trip.crew?.length}
        <div class="flex pl-2">
          {#each trip.crew as p}
            <span class="-ml-2"><Avatar name={p.name} src={p.avatar} size={28} ring /></span>
          {/each}
        </div>
      {/if}
      <span class="ml-auto flex flex-wrap justify-end gap-1.5">
        {#if planning}
          <Chip tone="sun">🌱 Planning</Chip>
          <Chip tone="berry">👥 {trip.members ?? 0} interested</Chip>
        {:else}
          <Chip tone="leaf">🎉 {trip.going ?? 0} {isPast ? 'went' : 'going'}</Chip>
          {#if (trip.maybe ?? 0) > 0}<Chip tone="sun">🤔 {trip.maybe} maybe</Chip>{/if}
        {/if}
      </span>
    </div>
  </a>
{/if}
