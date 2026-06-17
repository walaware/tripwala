<script>
  import Card from '$lib/ui/Card.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import ClaimRow from '$lib/ui/ClaimRow.svelte';
  import Checkbox from '$lib/ui/Checkbox.svelte';
  import { fmtDate, fmtDateRange } from '$lib/format.js';
  import { gearEmoji } from '$lib/avatar.js';

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

  const going = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'going').length);
  const maybe = $derived(participants.filter((/** @type {any} */ p) => p.rsvp_status === 'maybe').length);
  const openGear = $derived(gear.filter((/** @type {any} */ g) => g.remaining > 0).length);

  const sharedPacking = $derived(data.packing.filter((/** @type {any} */ p) => p.is_shared));
  const personalPacking = $derived(data.packing.filter((/** @type {any} */ p) => !p.is_shared));

  /** @type {Record<string, string>} */
  const statusEmoji = { going: '🔥', maybe: '🤔', out: '💤' };
</script>

<div class="min-h-full bg-sand-100 pb-10">
  <div class="mx-auto w-full max-w-3xl px-4 sm:px-6">
    {#if ownerMode}
      <div class="mt-4 rounded-md bg-sun-200 px-4 py-2.5 text-sm font-bold text-sun-600">
        ✨ Owner mode — editing controls land in the next steps.
      </div>
    {/if}

    <!-- Trip header -->
    <header class="px-2 pb-4 pt-6 text-center">
      <h1 class="font-display text-[27px] font-bold leading-[1.05] text-cocoa-900">{trip.name}</h1>
      <div class="mt-1 font-body text-sm font-extrabold text-coral-600">
        {#if trip.start_date}{fmtDateRange(trip.start_date, trip.end_date)}{/if}{#if trip.start_date && trip.location} · {/if}{trip.location}
      </div>
      <div class="mt-3 flex flex-wrap justify-center gap-1.5">
        <Chip tone="coral">🎉 {going} going</Chip>
        {#if maybe > 0}<Chip tone="sun">🤔 {maybe} maybe</Chip>{/if}
        <Chip tone="berry">🎒 {openGear} open</Chip>
      </div>
      {#if trip.expense_link}
        <a
          href={trip.expense_link}
          target="_blank"
          rel="noopener"
          class="mt-3 inline-block font-body text-[13px] font-extrabold text-cocoa-500 underline underline-offset-2"
        >
          💸 Split expenses ↗
        </a>
      {/if}
    </header>

    {#if top}{@render top()}{/if}

    <div class="flex flex-col gap-3.5 md:grid md:grid-cols-2 md:items-start">

      <!-- People -->
      <Card>
        <CardHeader icon="🙌" iconBg="var(--color-coral-200)" title="Who's coming?">
          {#snippet action()}
            <span class="font-body text-[12.5px] font-extrabold text-cocoa-500">{going} going</span>
          {/snippet}
        </CardHeader>
        <div class="flex flex-col gap-2">
          {#each participants as p}
            <div class="flex items-center gap-2.5" class:opacity-50={p.rsvp_status === 'out'}>
              <Avatar name={p.display_name} size={30} />
              <span class="font-body text-sm font-extrabold text-cocoa-900">
                {p.display_name}{#if p.id === currentParticipantId}<span class="font-bold text-cocoa-500"> (you)</span>{/if}
              </span>
              <span class="ml-auto text-[15px]">
                {p.rsvp_status ? statusEmoji[p.rsvp_status] : '·'}
              </span>
            </div>
          {/each}
        </div>
      </Card>

      <!-- Gear -->
      <Card>
        <CardHeader icon="🎒" iconBg="var(--color-sun-200)" title="Who's bringing what?" />
        {#if gear.length === 0}
          <p class="py-2 text-center font-body text-sm font-bold text-cocoa-500">Nothing on the list yet.</p>
        {:else}
          {#each gear as g, i}
            <ClaimRow
              emoji={gearEmoji(g.category)}
              emojiBg={g.remaining === 0 ? 'var(--color-coral-200)' : 'var(--color-sun-200)'}
              name={g.qty_needed > 1 ? `${g.name} ×${g.qty_needed}` : g.name}
              note="up for grabs!"
              claimedBy={g.claims.length ? g.claims.map((/** @type {any} */ c) => c.participantName).join(' & ') : null}
              divider={i !== 0}
            />
          {/each}
          <div class="mt-2.5 text-center font-body text-xs font-extrabold text-cocoa-500">
            {openGear === 0 ? '🎉 All covered!' : `${openGear} still open`}
          </div>
        {/if}
      </Card>

      <!-- Meals -->
      <Card>
        <CardHeader icon="🍳" iconBg="var(--color-berry-200)" title="What's for food?" />
        {#each meals as m, i}
          <div class="flex flex-col gap-0.5 py-2.5 {i !== 0 ? 'border-t border-sand-200' : ''}">
            <div class="flex items-baseline justify-between">
              <span class="font-body text-sm font-extrabold text-cocoa-900">{m.label}</span>
              <span class="font-body text-xs font-bold text-cocoa-500">{fmtDate(m.date)}</span>
            </div>
            {#if m.signups.length}
              {#each m.signups as s}
                <span class="font-body text-[13px] font-bold text-cocoa-700">
                  {s.participantName}{#if s.dish_note} — {s.dish_note}{/if}
                </span>
              {/each}
            {:else}
              <span class="font-body text-[13px] font-bold text-cocoa-500">nobody yet</span>
            {/if}
          </div>
        {/each}
      </Card>

      <!-- Packing -->
      <Card>
        <CardHeader icon="🧳" iconBg="var(--color-leaf-200)" title="What to pack" />
        {#if sharedPacking.length}
          <p class="mb-1 font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-500">Shared</p>
          {#each sharedPacking as p, i}
            <div class="flex items-center gap-3 py-2 {i !== 0 ? 'border-t border-sand-200' : ''}">
              <Checkbox checked={p.checked} />
              <span class="font-body font-bold text-cocoa-900" class:line-through={p.checked} class:text-cocoa-500={p.checked}>{p.label}</span>
            </div>
          {/each}
        {/if}
        {#if personalPacking.length}
          <p class="mb-1 mt-3 font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-500">Personal</p>
          {#each personalPacking as p, i}
            <div class="flex items-center gap-3 py-2 {i !== 0 ? 'border-t border-sand-200' : ''}">
              <Checkbox checked={p.checked} />
              <span class="flex-1 font-body font-bold text-cocoa-900" class:line-through={p.checked} class:text-cocoa-500={p.checked}>{p.label}</span>
              {#if p.participantName}<Avatar name={p.participantName} size={22} />{/if}
            </div>
          {/each}
        {/if}
      </Card>
    </div>

    <p class="mt-5 px-4 text-center font-body text-xs font-bold text-cocoa-500">
      Read-only preview · RSVP, claiming, and check-offs become interactive in the next steps.
    </p>
  </div>
</div>
