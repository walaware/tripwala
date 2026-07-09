<script>
  import { invalidateAll } from '$app/navigation';
  import { Card, Button, RangeCalendar } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { planAction } from '$lib/planClient.js';
  import { fmtDateRange } from '$lib/format.js';
  import { expandRange, groupDays, toggleRange } from '$lib/dateRanges.js';

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

  const now = new Date();
  const iso = (/** @type {Date} */ d) => d.toLocaleDateString('en-CA'); // local YYYY-MM-DD
  const todayIso = iso(now);
  // A year out. Constructing through Date rolls Feb 29 → Mar 1 rather than
  // producing a date that doesn't exist.
  const maxIso = iso(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));

  // My free days, optimistic: seeded from the server, updated in place so the
  // outline bands redraw before the round-trip lands.
  /** @type {string[]} */
  let myDays = $state([]);
  $effect(() => {
    myDays = [...availability.mine];
  });

  const memberCount = $derived(Math.max(1, availability.memberCount));

  // Heat is the GROUP signal only — what fraction of the trip is free that day.
  // My own days are drawn as outline bands instead, or a day only I'm free on
  // would look the same as one four people are free on.
  const heat = $derived(
    Object.fromEntries(
      Object.entries(availability.byDay)
        .filter(([, count]) => count > 0)
        .map(([date, count]) => [date, Math.min(1, count / memberCount)])
    )
  );

  /** @type {import('@walaware/design').DateRange[]} */
  const ranges = $derived([
    ...dateOptions.map((o) => ({
      id: o.id,
      start: o.start_date,
      end: o.end_date,
      tone: /** @type {const} */ ('candidate'),
      label: fmtDateRange(o.start_date, o.end_date),
      onClick: () => focusOption(o.id)
    })),
    ...groupDays(myDays).map((r, i) => ({
      id: `mine-${i}`,
      start: r.start,
      end: r.end,
      tone: /** @type {const} */ ('outline'),
      label: "You're free"
    }))
  ]);

  // The live selection. `valid` only flips once RangeCalendar tells us the span
  // passed minNights / bounds — a too-short span still renders, so you can see
  // what you picked rather than having it silently clamped.
  // `null`, not '' — RangeCalendar reads an unset span as nullish and falls back
  // to today for the leading month.
  /** @type {string | null} */
  let selStart = $state(null);
  /** @type {string | null} */
  let selEnd = $state(null);
  let valid = $state(false);
  let invalidMsg = $state('');
  let busy = $state('');
  let actionError = $state('');

  const selDays = $derived(selStart ? expandRange(selStart, selEnd || selStart) : []);
  const selNights = $derived(Math.max(0, selDays.length - 1));
  // Tapping a stretch you've already marked clears it, so the button has to say so.
  const clearing = $derived(valid && selDays.length > 0 && selDays.every((d) => myDays.includes(d)));

  /** @param {string} start @param {string} end */
  function onSelect(start, end) {
    selStart = start;
    selEnd = end;
    valid = true;
    invalidMsg = '';
    actionError = '';
  }

  /**
   * @param {string} start @param {string} end
   * @param {import('@walaware/design').InvalidReason} reason
   */
  function onInvalidSelect(start, end, reason) {
    selStart = start;
    selEnd = end;
    valid = false;
    const nights = expandRange(start, end).length - 1;
    invalidMsg =
      reason === 'too-short'
        ? `That's ${nights} night${nights === 1 ? '' : 's'} — this trip needs at least ${minNights}.`
        : reason === 'out-of-bounds'
          ? 'Pick dates between today and a year out.'
          : "Those dates aren't all available.";
  }

  function clearSelection() {
    selStart = null;
    selEnd = null;
    valid = false;
    invalidMsg = '';
  }

  /** @param {string} optionId */
  function focusOption(optionId) {
    document.getElementById(`opt-${optionId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // "I'm free then" — the range toggles against my day set. Availability is
  // still stored as loose days server-side; only the UI thinks in stretches.
  async function toggleFree() {
    if (!valid || !selStart || busy) return;
    busy = 'free';
    actionError = '';
    const next = toggleRange(myDays, selStart, selEnd || selStart);
    const prev = myDays;
    myDays = next;
    try {
      await planAction(shareToken, { op: 'set_availability', dates: next });
      clearSelection();
      await invalidateAll();
    } catch (_) {
      myDays = prev;
      actionError = "Couldn't save those days.";
    } finally {
      busy = '';
    }
  }

  async function proposeRange() {
    if (!valid || !selStart || busy) return;
    busy = 'propose';
    actionError = '';
    try {
      await planAction(shareToken, { op: 'propose_date', start: selStart, end: selEnd || selStart });
      clearSelection();
      await invalidateAll();
    } catch (_) {
      actionError = 'Could not propose those dates.';
    } finally {
      busy = '';
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

  <p class="mb-2 font-body text-[13px] font-extrabold text-cocoa-700">
    Drag a stretch you're free. Darker days suit more people.
  </p>

  <RangeCalendar
    bind:start={selStart}
    bind:end={selEnd}
    min={todayIso}
    max={maxIso}
    {minNights}
    {heat}
    {ranges}
    heatLabel={(_d, v) => `${Math.round(v * memberCount)} of ${memberCount} free`}
    label="Trip dates"
    {onSelect}
    {onInvalidSelect}
  />

  {#if selStart}
    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-3">
      <span class="font-display text-sm font-semibold text-cocoa-900">
        {fmtDateRange(selStart, selEnd || selStart)}
        {#if valid}<span class="font-body text-[12.5px] font-bold text-cocoa-500">· {selNights} night{selNights === 1 ? '' : 's'}</span>{/if}
      </span>
      <span class="ml-auto flex flex-wrap gap-2">
        <Button variant="soft" size="sm" disabled={!valid || !!busy} onclick={toggleFree}>
          {busy === 'free' ? 'Saving…' : clearing ? "I'm not free then" : "I'm free then"}
        </Button>
        {#if isOrganizer}
          <Button variant="primary" size="sm" disabled={!valid || !!busy} onclick={proposeRange}>
            {busy === 'propose' ? 'Proposing…' : 'Propose dates'}
          </Button>
        {/if}
        <Button variant="ghost" size="sm" onclick={clearSelection}>Clear</Button>
      </span>
    </div>
    {#if invalidMsg}
      <p class="mt-1.5 font-body text-xs font-bold text-berry-600">{invalidMsg}</p>
    {:else if actionError}
      <p class="mt-1.5 font-body text-xs font-bold text-berry-600">{actionError}</p>
    {/if}
  {/if}

  <!-- Candidate ranges. Voting lives here, not on the calendar bars: a 16px bar
       is a bad tap target, and these rows already carry the tallies. -->
  {#if dateOptions.length}
    <div class="mt-4 flex flex-col gap-2 border-t border-sand-200 pt-3">
      <p class="font-body text-[13px] font-extrabold text-cocoa-700">Proposed dates</p>
      {#each dateOptions as o (o.id)}
        <div id="opt-{o.id}" class="rounded-xl bg-sand-100 px-4 py-3">
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
</Card>
