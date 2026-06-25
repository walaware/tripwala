<script>
  import { invalidateAll } from '$app/navigation';
  import { Card } from '@walaware/design';
  import { Button } from '@walaware/design';
  import { DateField } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { planAction } from '$lib/planClient.js';
  import { fmtDateRange } from '$lib/format.js';

  /**
   * @type {{
   *   shareToken: string,
   *   dateOptions: Array<{id:string,start_date:string,end_date:string,yes:number,maybe:number,no:number,mine:string|null}>,
   *   availability: { byDay: Record<string,number>, mine: string[], memberCount: number },
   *   isOrganizer: boolean,
   *   minNights?: number
   * }}
   */
  let { shareToken, dateOptions, availability, isOrganizer, minNights = 0 } = $props();

  /** @type {Set<string>} */
  let mine = $state(new Set());
  $effect(() => {
    mine = new Set(availability.mine);
  });

  let propStart = $state('');
  let propEnd = $state('');
  let busy = $state(false);
  let proposeError = $state('');

  // Nights in the currently-typed range; gate Propose on the trip's minimum.
  const propNights = $derived(
    propStart ? Math.round((Date.parse(propEnd || propStart) - Date.parse(propStart)) / 86400000) : 0
  );
  const tooShort = $derived(minNights > 0 && !!propStart && propNights < minNights);

  const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** @param {number} y @param {number} m @param {number} d */
  const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // Pageable month grid (trips can be far out): one month at a time on phones,
  // three on wider screens. Range/day picks span months freely regardless.
  const now = new Date();
  let monthOffset = $state(0);
  const MAX_OFFSET = 12; // page availability up to ~a year ahead

  let wide = $state(true); // SSR-safe default; corrected on mount
  $effect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => (wide = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });
  const perPage = $derived(wide ? 3 : 1);

  const months = $derived(
    Array.from({ length: perPage }, (_, off) => {
      const base = new Date(now.getFullYear(), now.getMonth() + monthOffset + off, 1);
      const y = base.getFullYear();
      const m = base.getMonth();
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      /** @type {Array<{date:string,day:number}|null>} */
      const cells = [];
      for (let i = 0; i < first; i++) cells.push(null);
      for (let d = 1; d <= days; d++) cells.push({ date: ymd(y, m, d), day: d });
      return { label: `${MONTHS[m]} ${y}`, cells };
    })
  );

  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());

  /** @param {string} date */
  async function toggleDay(date) {
    if (date < todayStr) return; // no past days
    const next = new Set(mine);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    mine = next;
    try {
      await planAction(shareToken, { op: 'set_availability', dates: [...next] });
      await invalidateAll();
    } catch (_) {
      await invalidateAll();
    }
  }

  /** Heat 0..1 of a day's availability across the group. */
  function heat(/** @type {string} */ date) {
    const c = availability.byDay[date] ?? 0;
    const n = Math.max(1, availability.memberCount);
    return c / n;
  }

  async function proposeRange() {
    if (!propStart || busy) return;
    if (tooShort) {
      proposeError = `This trip needs at least ${minNights} night${minNights === 1 ? '' : 's'}.`;
      return;
    }
    busy = true;
    proposeError = '';
    try {
      await planAction(shareToken, { op: 'propose_date', start: propStart, end: propEnd || propStart });
      propStart = '';
      propEnd = '';
      await invalidateAll();
    } catch (_) {
      proposeError = 'Could not propose those dates.';
    } finally {
      busy = false;
    }
  }

  /** @param {string} optionId @param {string} vote @param {string|null} current */
  async function voteDate(optionId, vote, current) {
    const next = current === vote ? '' : vote; // tap again to clear
    try {
      await planAction(shareToken, { op: 'vote_date', optionId, vote: next });
      await invalidateAll();
    } catch (_) {
      await invalidateAll();
    }
  }

  /** @param {string} optionId */
  async function removeOption(optionId) {
    try {
      await planAction(shareToken, { op: 'remove_date', optionId });
      await invalidateAll();
    } catch (_) {
      await invalidateAll();
    }
  }

  const voteBtn = 'rounded-full px-2.5 py-1 font-body text-xs font-extrabold transition';
</script>

<SectionHeader emoji="📅" title="When can everyone go?" />
<Card>

  {#if minNights > 0}
    <div class="mb-3 rounded-xl bg-sun-100 px-3 py-2 font-body text-[12.5px] font-extrabold text-cocoa-700">
      📏 This trip is at least {minNights} night{minNights === 1 ? '' : 's'} — pick a stretch that long.
    </div>
  {/if}

  <!-- Owner-proposed candidate ranges -->
  {#if dateOptions.length}
    <div class="flex flex-col gap-2">
      {#each dateOptions as o (o.id)}
        <div class="rounded-xl bg-sand-100 px-4 py-3">
          <div class="flex items-center justify-between gap-2">
            <span class="font-display text-sm font-semibold text-cocoa-900">
              {fmtDateRange(o.start_date, o.end_date)}
            </span>
            {#if isOrganizer}
              <button type="button" onclick={() => removeOption(o.id)} class="font-body text-xs font-extrabold text-cocoa-400 hover:text-berry-600">
                Remove
              </button>
            {/if}
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <button type="button" class="{voteBtn} {o.mine === 'yes' ? 'bg-leaf-500 text-white' : 'bg-white text-cocoa-700'}" onclick={() => voteDate(o.id, 'yes', o.mine)}>👍 Yes {o.yes || ''}</button>
            <button type="button" class="{voteBtn} {o.mine === 'maybe' ? 'bg-sun-400 text-cocoa-900' : 'bg-white text-cocoa-700'}" onclick={() => voteDate(o.id, 'maybe', o.mine)}>🤔 Maybe {o.maybe || ''}</button>
            <button type="button" class="{voteBtn} {o.mine === 'no' ? 'bg-berry-500 text-white' : 'bg-white text-cocoa-700'}" onclick={() => voteDate(o.id, 'no', o.mine)}>👎 No {o.no || ''}</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if isOrganizer}
    <div class="mt-2.5 flex flex-col gap-2">
      <DateField range bind:start={propStart} bind:end={propEnd} startLabel="From" endLabel="To" min={todayStr} minNights={minNights} />
      <Button variant="soft" size="sm" class="w-full whitespace-nowrap sm:w-auto sm:self-start" onclick={proposeRange} disabled={!propStart || busy || tooShort}>
        Propose dates
      </Button>
    </div>
    {#if tooShort}
      <p class="mt-1.5 font-body text-xs font-bold text-cocoa-500">
        That's {propNights} night{propNights === 1 ? '' : 's'} — this trip needs at least {minNights}.
      </p>
    {:else if proposeError}
      <p class="mt-1.5 font-body text-xs font-bold text-berry-600">{proposeError}</p>
    {/if}
  {/if}

  <!-- Free-pick availability heatmap -->
  <div class="mt-4 border-t border-sand-200 pt-3">
    <div class="flex items-center justify-between">
      <p class="font-body text-[13px] font-extrabold text-cocoa-700">Or tap the days you're free</p>
      <div class="flex items-center gap-1">
        <button type="button" onclick={() => (monthOffset = Math.max(0, monthOffset - perPage))} disabled={monthOffset === 0} class="rounded-md px-2 py-0.5 font-body text-sm font-extrabold text-cocoa-500 hover:bg-sand-100 disabled:opacity-30" aria-label="earlier months">◀</button>
        <button type="button" onclick={() => (monthOffset = Math.min(MAX_OFFSET, monthOffset + perPage))} disabled={monthOffset >= MAX_OFFSET} class="rounded-md px-2 py-0.5 font-body text-sm font-extrabold text-cocoa-500 hover:bg-sand-100 disabled:opacity-30" aria-label="later months">▶</button>
      </div>
    </div>
    <p class="font-body text-xs font-bold text-cocoa-400">Darker = more people free. Your picks are outlined.</p>
    <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {#each months as month}
        <div>
          <div class="mb-1 text-center font-display text-xs font-bold text-cocoa-700">{month.label}</div>
          <div class="grid grid-cols-7 gap-0.5">
            {#each WEEKDAYS as wd, i}
              <div class="text-center font-body text-[9px] font-bold text-cocoa-400">{wd}</div>
            {/each}
            {#each month.cells as cell}
              {#if cell}
                {@const isMine = mine.has(cell.date)}
                {@const past = cell.date < todayStr}
                {@const h = heat(cell.date)}
                <button
                  type="button"
                  disabled={past}
                  onclick={() => toggleDay(cell.date)}
                  class="aspect-square rounded text-[10px] font-bold transition disabled:opacity-30 {isMine ? 'ring-2 ring-coral-500' : ''}"
                  style="background: {h > 0 ? `color-mix(in srgb, var(--color-coral-500) ${Math.round(h * 70)}%, var(--color-sand-100))` : 'var(--color-sand-100)'}; color: {h > 0.5 ? '#fff' : 'var(--color-cocoa-700)'}"
                >
                  {cell.day}
                </button>
              {:else}
                <div></div>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</Card>
