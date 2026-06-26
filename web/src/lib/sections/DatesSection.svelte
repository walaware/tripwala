<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { fmtDateRange, tripLength, tripDays } from '$lib/format.js';

  /**
   * @type {{
   *   trip: any,
   *   shareToken: string,
   *   itinerary?: Record<string, { id: string, label: string }>,
   *   meals?: Array<any>,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null,
   *   isPast?: boolean
   * }}
   */
  let { trip, shareToken, itinerary = {}, meals = [], ownerMode = false, onHide = null, collapsed = false, onToggle = null, isPast = false } = $props();

  const range = $derived(fmtDateRange(trip.start_date, trip.end_date));
  const len = $derived(tripLength(trip.start_date, trip.end_date));
  const days = $derived(tripDays(trip.start_date, trip.end_date));

  /** @param {string} iso */
  const dayKey = (iso) => new Date(iso).toISOString().slice(0, 10);
  /** "Fri Oct 10" — the combined coral day label. @param {string} iso */
  const dayLabel = (iso) =>
    new Date(iso)
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
      .replace(',', '');

  // Meals grouped by UTC day — the fallback plan when no itinerary is set.
  const mealsByDay = $derived.by(() => {
    /** @type {Record<string, string[]>} */
    const map = {};
    for (const m of meals) {
      if (!m.date) continue;
      (map[dayKey(m.date)] ||= []).push(m.label);
    }
    return map;
  });

  let busy = $state('');
  /** @param {string} key @param {string} label */
  async function setPlan(key, label) {
    const current = itinerary[key]?.label ?? '';
    if (label.trim() === current.trim() || busy) return;
    busy = key;
    try {
      await tripAction(shareToken, { op: 'itinerary_set', date: key, label: label.trim() });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }
</script>

<SectionHeader emoji="📅" title={isPast ? 'When' : 'Dates'} {onHide} {collapsed} {onToggle} />
<Card>
  <div class="flex items-baseline gap-2.5">
    <span class="font-display text-[20px] font-bold text-text-strong">{range || 'Dates TBD'}</span>
    {#if len.nights > 0}
      <span class="font-body text-[13px] font-extrabold text-text-muted">{len.nights} night{len.nights === 1 ? '' : 's'}</span>
    {/if}
  </div>

  {#if days.length > 1}
    <div class="mt-3.5">
      {#each days as d, i}
        {@const key = dayKey(d.iso)}
        {@const plan = itinerary[key]?.label ?? ''}
        {@const fallback = mealsByDay[key]?.length ? `🍳 ${mealsByDay[key].join(' · ')}` : ''}
        <div class="flex items-center gap-3 py-2.5 {i !== 0 ? 'border-t border-sand-200' : ''}">
          <span class="w-[104px] shrink-0 font-body text-[13.5px] font-extrabold text-[var(--color-primary-press)]">
            {dayLabel(d.iso)}
          </span>
          {#if ownerMode}
            <input
              value={plan}
              disabled={busy === key}
              placeholder={fallback || 'Add a plan…'}
              onblur={(e) => setPlan(key, e.currentTarget.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              class="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 font-body text-[13.5px] font-bold text-text-body outline-none placeholder:font-bold placeholder:text-cocoa-400 hover:bg-sand-100 focus:bg-sand-100"
            />
          {:else}
            <span class="min-w-0 flex-1 font-body text-[13.5px] font-bold text-text-body">
              {plan || fallback || '—'}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</Card>
