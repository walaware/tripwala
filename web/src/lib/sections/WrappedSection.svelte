<script>
  // Post-trip "Wrapped" recap (#10) — a celebratory summary computed entirely
  // from data already on the page (no new schema / queries). Shown at the top of
  // the trip once its end date has passed (see TripView's `isPast`).
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import LocationHeroCard from '$lib/ui/LocationHeroCard.svelte';
  import { cardImage } from '$lib/locationCard.js';
  import { fmtDateRange, tripLength } from '$lib/format.js';

  /**
   * @type {{
   *   trip: any,
   *   participants: Array<any>,
   *   gear: Array<any>,
   *   meals: Array<any>,
   *   expenses: Array<any>,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { trip, participants, gear, meals, expenses, collapsed = false, onToggle = null } = $props();

  const stats = $derived.by(() => {
    const len = tripLength(trip.start_date, trip.end_date);
    const mealsCooked = meals.filter((m) => m.ownerParticipant).length;
    const dishes = meals.filter((m) => m.dish).map((m) => ({ meal: m.label, dish: m.dish, by: m.ownerName }));
    const gearDone = gear.filter((g) => g.remaining === 0).length;
    const expTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // Contribution tally: a point per meal cooked + per gear claim.
    /** @type {Record<string, number>} */
    const contrib = {};
    for (const m of meals) if (m.ownerParticipant) contrib[m.ownerParticipant] = (contrib[m.ownerParticipant] || 0) + 1;
    for (const g of gear) for (const c of g.claims || []) contrib[c.participant] = (contrib[c.participant] || 0) + 1;
    /** @type {Record<string, string>} */
    const nameById = Object.fromEntries(participants.map((p) => [p.id, p.display_name]));
    let topId = '';
    let topN = 0;
    for (const [id, n] of Object.entries(contrib)) if (n > topN) ((topN = n), (topId = id));

    return {
      days: len.days,
      nights: len.nights,
      crew: participants.length,
      mealsCooked,
      dishes,
      gearDone,
      gearTotal: gear.length,
      expTotal,
      expCount: expenses.length,
      topName: topId ? nameById[topId] : '',
      topN
    };
  });

  const money = (/** @type {number} */ n) => `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

  // The picked location's photo, carried over from planning — folded into the
  // recap so a wrapped trip has a single summary card (no separate Overview).
  const heroImg = $derived(trip.pickedLocation ? cardImage(trip.pickedLocation) : { src: '' });

  // The headline stat tiles — only the ones with something to show.
  const tiles = $derived.by(() => {
    /** @type {Array<{ label: string, value: string }>} */
    const out = [];
    if (stats.days) out.push({ label: 'On the road', value: `${stats.days}d · ${stats.nights}n` });
    out.push({ label: 'Crew', value: String(stats.crew) });
    if (stats.mealsCooked) out.push({ label: 'Meals cooked', value: String(stats.mealsCooked) });
    if (stats.gearTotal) out.push({ label: 'Gear sorted', value: `${stats.gearDone}/${stats.gearTotal}` });
    if (stats.expCount) out.push({ label: 'Shared', value: money(stats.expTotal) });
    return out;
  });
</script>

<SectionHeader emoji="🎉" title="Wrapped" subtitle="— how it went" {collapsed} {onToggle} />
<Card>
  <!-- Celebratory banner -->
  <div
    class="relative overflow-hidden rounded-2xl p-5 text-center text-white"
    style="background: linear-gradient(135deg, var(--color-coral-500), var(--color-berry-600))"
  >
    <div class="font-body text-[12px] font-extrabold uppercase tracking-wide text-white/80">That's a wrap</div>
    <div class="mt-1 font-display text-[22px] font-bold leading-tight">{trip.name} 🎉</div>
    <div class="mt-1 font-body text-[13px] font-bold text-white/90">
      {#if trip.start_date}{fmtDateRange(trip.start_date, trip.end_date)}{/if}{#if trip.location} · {trip.location}{/if}
    </div>
  </div>

  <!-- Picked location's photo (carried over from planning). -->
  {#if heroImg.src}
    <div class="mt-4">
      <LocationHeroCard location={trip.pickedLocation} eyebrow="📍 Where we went" />
    </div>
  {/if}

  <!-- Headline stats -->
  <div class="mt-4 grid grid-cols-3 gap-2.5">
    {#each tiles as t}
      <div class="rounded-md bg-surface-sunk px-2 py-3 text-center">
        <div class="font-body text-[10.5px] font-extrabold uppercase tracking-wide text-text-muted">{t.label}</div>
        <div class="mt-0.5 font-display text-[16px] font-bold text-text-strong">{t.value}</div>
      </div>
    {/each}
  </div>

  {#if stats.topName}
    <div class="mt-4 flex items-center gap-2.5 rounded-2xl bg-sun-200 px-4 py-3">
      <span class="text-2xl" aria-hidden="true">🏆</span>
      <div>
        <div class="font-body text-[11px] font-extrabold uppercase tracking-wide text-sun-600">MVP</div>
        <div class="font-display text-[15px] font-bold text-cocoa-900">
          {stats.topName} <span class="font-body text-[13px] font-bold text-cocoa-500">— {stats.topN} contribution{stats.topN === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  {/if}

  {#if stats.dishes.length}
    <div class="mt-4">
      <div class="mb-1.5 font-body text-[12.5px] font-extrabold text-cocoa-500">🍽️ On the menu</div>
      <ul class="flex flex-col gap-1">
        {#each stats.dishes as d}
          <li class="font-body text-[13px] font-bold text-cocoa-600">
            <span class="font-extrabold text-cocoa-900">{d.dish}</span>{#if d.by} · {d.by}{/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if trip.description}
    <!-- Trip details / notes carried over from the trip page. -->
    <div
      class="mt-4 rounded-2xl bg-sand-100 p-4 font-body text-[13.5px] leading-relaxed text-cocoa-700 [&_a]:font-extrabold [&_a]:text-coral-700 [&_a]:underline [&_a]:underline-offset-2"
    >
      {@html trip.description}
    </div>
  {/if}
</Card>
