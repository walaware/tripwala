<script>
  import { CalendarMonth, EmptyState } from '@walaware/design';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const ymd = (/** @type {string} */ d) => String(d ?? '').slice(0, 10);

  // Owned trips are interactive (link through); friends' shared trips are muted,
  // read-only teasers (no link) — the tone distinction the design kit provides.
  const OWNED = /** @type {import('@walaware/design').CalendarTone} */ ('owned');
  const TEASER = /** @type {import('@walaware/design').CalendarTone} */ ('teaser');
  const events = $derived([
    ...data.ownEvents.map((e) => ({
      id: e.id,
      title: e.name,
      start: ymd(e.start_date),
      end: ymd(e.end_date),
      tone: OWNED,
      emoji: '🧭',
      href: `/${e.slug}`
    })),
    ...data.friendEvents.map((e) => ({
      id: e.id,
      title: e.name,
      start: ymd(e.start_date),
      end: ymd(e.end_date),
      tone: TEASER,
      emoji: '👋'
    }))
  ]);

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth() + 1);

  function prev() {
    if (month === 1) {
      month = 12;
      year -= 1;
    } else month -= 1;
  }
  function next() {
    if (month === 12) {
      month = 1;
      year += 1;
    } else month += 1;
  }
</script>

<svelte:head><title>tripwala — calendar</title></svelte:head>

<div>
  <div class="flex items-start justify-between gap-3 border-b border-sand-300 pb-4">
    <div>
      <h1 class="font-display text-[27px] font-bold tracking-tight text-text-strong">Calendar</h1>
      <p class="mt-0.5 font-body text-[15px] font-bold text-text-muted">
        Your trips, plus the ones friends have shared.
      </p>
    </div>
  </div>

  {#if events.length}
    <div class="mt-6 rounded-2xl bg-surface-card p-3 shadow-card sm:p-5">
      <CalendarMonth {year} {month} {events} onPrev={prev} onNext={next} />
    </div>
    <div class="mt-4 flex flex-wrap gap-4 font-body text-[13px] font-bold text-text-muted">
      <span class="inline-flex items-center gap-1.5">
        <span class="h-3 w-3 rounded-full bg-accent"></span> Your trips
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="h-3 w-3 rounded-full bg-sand-400"></span> Shared by friends
      </span>
    </div>
  {:else}
    <div class="mt-8">
      <EmptyState
        emoji="📅"
        title="Nothing on the calendar yet"
        body="Plan a trip, or add friends so their shared trips show up here."
      />
    </div>
  {/if}
</div>
