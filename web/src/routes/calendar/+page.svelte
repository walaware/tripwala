<script>
  import { CalendarMonth, EmptyState, Avatar, Switch, colorFor } from '@walaware/design';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const OWNED = /** @type {import('@walaware/design').CalendarTone} */ ('owned');
  const TEASER = /** @type {import('@walaware/design').CalendarTone} */ ('teaser');

  const people = $derived(data.people);
  const peopleById = $derived(new Map(people.map((/** @type {any} */ p) => [p.id, p])));
  /** @param {string} id */
  const hue = (id) => colorFor(peopleById.get(id)?.colorName ?? '');

  // Filter state: which people's trips are shown. Everyone on by default.
  /** @type {Set<string>} */
  let enabled = $state(new Set());
  $effect(() => {
    // Seed once from the loaded people (and keep any newly-arrived person on).
    if (enabled.size === 0) enabled = new Set(people.map((/** @type {any} */ p) => p.id));
  });
  /** @param {string} id */
  function toggle(id) {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    enabled = next;
  }

  /** @param {Array<{ name: string }>} owners */
  function awayNames(owners) {
    const names = owners.map((o) => o.name);
    if (names.length <= 2) return names.join(' & ') || 'Someone';
    return `${names[0]} +${names.length - 1}`;
  }

  const events = $derived.by(() => {
    /** @type {any[]} */
    const out = [];
    // Your trips — always yours to open; marked shared when a co-traveller whose
    // filter is on is also on the trip (dedup: the teaser copy is never rendered).
    if (enabled.has('you')) {
      for (const e of data.ownEvents) {
        const withMe = e.coTravellers.filter((/** @type {any} */ c) => enabled.has(c.id));
        const shared = withMe.length > 0;
        out.push({
          id: e.id,
          title: shared ? `👥 ${e.title} · with ${withMe.map((/** @type {any} */ c) => c.name).join(', ')}` : e.title,
          start: e.start,
          end: e.end,
          tone: OWNED,
          color: hue('you'),
          emoji: shared ? '' : '🧭',
          href: `/${e.slug}`
        });
      }
    }
    // Friends' shared trips (read-only teasers) — shown when any attributed friend
    // is enabled; coloured by that friend.
    for (const e of data.teaserEvents) {
      const owner = e.owners.find((/** @type {any} */ o) => enabled.has(o.id));
      if (!owner) continue;
      out.push({
        id: e.id,
        title: e.busy ? `${awayNames(e.owners)} away` : e.name,
        start: e.start,
        end: e.end,
        tone: TEASER,
        color: hue(owner.id),
        emoji: e.busy ? '🔒' : '👋'
      });
    }
    return out;
  });

  const hasAnyTrips = $derived(data.ownEvents.length > 0 || data.teaserEvents.length > 0);

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth() + 1);
  function prev() {
    if (month === 1) { month = 12; year -= 1; } else month -= 1;
  }
  function next() {
    if (month === 12) { month = 1; year += 1; } else month += 1;
  }
</script>

<svelte:head><title>tripwala — calendar</title></svelte:head>

<div>
  <div class="border-b border-sand-300 pb-4">
    <h1 class="font-display text-[27px] font-bold tracking-tight text-text-strong">Calendar</h1>
    <p class="mt-0.5 font-body text-[15px] font-bold text-text-muted">
      Your trips, plus the ones friends have shared.
    </p>
  </div>

  {#if hasAnyTrips}
    <div class="cal-layout mt-6">
      <div class="cal-main">
        <!-- Mobile: a horizontal colour-chip filter above the calendar. -->
        <div class="mobile-filter">
          {#each people as p (p.id)}
            <button
              type="button"
              class="chip {enabled.has(p.id) ? 'chip-on' : 'chip-off'}"
              aria-pressed={enabled.has(p.id)}
              onclick={() => toggle(p.id)}
            >
              <span class="chip-dot" style="background: {hue(p.id)}"></span>
              {p.label}
            </button>
          {/each}
        </div>

        <div class="rounded-2xl bg-surface-card p-3 shadow-card sm:p-5">
          <CalendarMonth {year} {month} {events} onPrev={prev} onNext={next} />
        </div>
      </div>

      <!-- Desktop: the "Whose trips" rail — colour key AND filter. -->
      <aside class="cal-rail">
        <h2 class="mb-2 px-1 font-body text-[11px] font-extrabold uppercase tracking-wide text-text-muted">Whose trips</h2>
        <div class="rounded-2xl bg-surface-card p-2 shadow-card">
          {#each people as p, i (p.id)}
            <div class="flex items-center gap-2.5 px-1.5 py-2 {i === 0 ? '' : 'border-t border-sand-200'}">
              <Avatar name={p.label} src={p.avatar || null} color={hue(p.id)} size={30} />
              <div class="min-w-0 flex-1">
                <div class="truncate font-body text-[14px] font-extrabold text-text-strong">{p.label}</div>
                <div class="font-body text-[12px] font-bold text-text-muted">
                  {#if p.count}
                    {p.isYou ? `${p.count} trip${p.count === 1 ? '' : 's'}` : `${p.count} together`}
                  {:else}
                    {p.isYou ? 'No trips yet' : 'shared with you'}
                  {/if}
                </div>
              </div>
              <Switch checked={enabled.has(p.id)} ariaLabel="Show {p.label}'s trips" onChange={() => toggle(p.id)} />
            </div>
          {/each}
        </div>
      </aside>
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

<style>
  .cal-layout {
    display: flex;
    gap: 22px;
    align-items: flex-start;
  }
  .cal-main {
    flex: 1;
    min-width: 0;
  }
  .cal-rail {
    flex: none;
    width: 260px;
  }
  .mobile-filter {
    display: none;
  }
  /* Below the shell breakpoint: hide the rail, show a horizontal chip filter. */
  @media (max-width: 919px) {
    .cal-rail {
      display: none;
    }
    .mobile-filter {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 10px;
      margin-bottom: 4px;
      scrollbar-width: none;
    }
    .mobile-filter::-webkit-scrollbar {
      display: none;
    }
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex: none;
    border-radius: 999px;
    padding: 6px 12px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 800;
    border: 1.5px solid var(--color-sand-300);
    transition: opacity 0.15s;
  }
  .chip-on {
    color: var(--color-text-strong);
    background: var(--color-surface-card);
  }
  .chip-off {
    color: var(--color-text-muted);
    opacity: 0.55;
  }
  .chip-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex: none;
  }
</style>
