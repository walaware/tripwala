<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Avatar, Button, EmptyState, Tooltip } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { tripDays, fmtWeekday, fmtMonthDay, fmtDateRange, tripLength } from '$lib/format.js';
  import { navUrl } from '$lib/maps.js';

  /**
   * @typedef {{ id: string, date: string, time: string, label: string, place: string, kind: 'fixed'|'flexible', sortOrder: number, createdBy: string|null, createdByName: string|null, createdByAvatar: string, votes: number, mine: boolean }} ItinItem
   */

  /**
   * @type {{
   *   shareToken: string,
   *   itineraryItems: ItinItem[],
   *   mapApp?: 'apple'|'google',
   *   trip: { start_date?: string, end_date?: string },
   *   currentParticipantId: string | null,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let {
    shareToken,
    itineraryItems,
    mapApp = 'apple',
    trip,
    currentParticipantId,
    ownerMode = false,
    onHide = null,
    collapsed = false,
    onToggle = null
  } = $props();

  const range = $derived(fmtDateRange(trip.start_date, trip.end_date));
  const len = $derived(tripLength(trip.start_date, trip.end_date));
  const canVote = $derived(!!currentParticipantId);
  /** Creator of the item or an organizer may edit / remove it. */
  const canManage = (/** @type {ItinItem} */ it) => ownerMode || (!!currentParticipantId && it.createdBy === currentParticipantId);

  // Group items under the trip's days, plus a trailing "To decide" bucket for
  // undated suggestions. Dated items outside the range still get a day group.
  const days = $derived(tripDays(trip.start_date, trip.end_date));
  const itemsByDate = $derived.by(() => {
    /** @type {Record<string, ItinItem[]>} */
    const m = {};
    for (const it of itineraryItems) if (it.date) (m[it.date] ??= []).push(it);
    return m;
  });
  const undated = $derived(itineraryItems.filter((it) => !it.date));
  /** @param {string} key YYYY-MM-DD */
  const keyLabel = (key) => `${fmtWeekday(`${key}T00:00:00.000Z`)} ${fmtMonthDay(`${key}T00:00:00.000Z`)}`;
  const groups = $derived.by(() => {
    const rangeKeys = days.map((d) => d.iso.slice(0, 10));
    const inRange = new Set(rangeKeys);
    const extra = [...new Set(itineraryItems.filter((it) => it.date && !inRange.has(it.date)).map((it) => it.date))].sort();
    return [...rangeKeys, ...extra].map((key) => ({ key, label: keyLabel(key), items: itemsByDate[key] ?? [] }));
  });
  const total = $derived(itineraryItems.length);

  let busy = $state(false);

  // One open "add" form at a time, keyed by day ('' = the To-decide bucket).
  /** @type {string | null} */
  let addKey = $state(null);
  let niLabel = $state('');
  let niTime = $state('');
  let niPlace = $state('');
  /** @type {'fixed'|'flexible'} */
  let niKind = $state('flexible');
  // One open item editor at a time.
  let editId = $state('');
  let eLabel = $state('');
  let eTime = $state('');
  let ePlace = $state('');
  /** @type {'fixed'|'flexible'} */
  let eKind = $state('flexible');

  /** @param {Record<string, unknown>} body */
  async function run(body) {
    if (busy) return;
    busy = true;
    try {
      await tripAction(shareToken, body);
      await invalidateAll();
    } catch (_) {
      await invalidateAll(); // reconcile on next load
    } finally {
      busy = false;
    }
  }

  /** @param {string|null} key the day to add to ('' = undated) */
  function openAdd(key) {
    addKey = key;
    niLabel = '';
    niTime = '';
    niPlace = '';
    niKind = 'flexible';
  }
  async function submitAdd() {
    if (!niLabel.trim() || addKey === null) return;
    const date = addKey || undefined;
    // Undated entries are always suggestions (decisions to vote on).
    const kind = addKey === '' ? 'flexible' : niKind;
    await run({ op: 'itin_item_add', label: niLabel.trim(), time: niTime.trim(), place: niPlace.trim(), date, kind });
    addKey = null;
  }

  /** @param {ItinItem} it */
  function openEdit(it) {
    editId = it.id;
    eLabel = it.label;
    eTime = it.time;
    ePlace = it.place;
    eKind = it.kind;
  }
  async function submitEdit() {
    if (!eLabel.trim()) return;
    const id = editId;
    await run({ op: 'itin_item_update', itemId: id, label: eLabel.trim(), time: eTime.trim(), place: ePlace.trim(), kind: eKind });
    editId = '';
  }

  /** @param {string} itemId */
  const vote = (itemId) => run({ op: 'itin_vote', itemId });
  /** @param {string} itemId */
  const removeItem = (itemId) => run({ op: 'itin_item_remove', itemId });
</script>

<SectionHeader emoji="🗓️" title="Itinerary" subtitle={total ? `${total} planned` : ''} {onHide} {collapsed} {onToggle} />
<Card>
  <!-- The trip dates lead the plan (no separate Dates section). -->
  <div class="mb-3 flex items-baseline gap-2.5">
    <span class="font-display text-[20px] font-bold text-text-strong">{range || 'Dates TBD'}</span>
    {#if len.nights > 0}
      <span class="font-body text-[13px] font-extrabold text-text-muted">{len.nights} night{len.nights === 1 ? '' : 's'}</span>
    {/if}
  </div>

  {#if !days.length && !total}
    <EmptyState
      emoji="🗓️"
      title="No plan yet"
      body="Add fixed entries like check-in & check-out, or suggest flexible ideas the crew can upvote."
    />
  {/if}

  <div class="flex flex-col gap-4">
    {#each groups as g (g.key)}
      {@render dayGroup(g.key, g.label, g.items)}
    {/each}
    <!-- Undated suggestions: free-form decisions the group upvotes. -->
    {@render dayGroup('', 'To decide', undated, true)}
  </div>
</Card>

{#snippet dayGroup(/** @type {string} */ key, /** @type {string} */ label, /** @type {ItinItem[]} */ items, /** @type {boolean} */ decisions = false)}
  {#if items.length || canVote}
    <div>
      <div class="mb-1.5 flex items-center gap-2 px-1">
        <span class="font-display text-[13px] font-bold {decisions ? 'text-berry-600' : 'text-coral-600'}">
          {decisions ? '🗳️ ' : ''}{label}
        </span>
        <span class="h-px flex-1 bg-sand-200"></span>
      </div>

      <div class="flex flex-col gap-1.5">
        {#each items as it (it.id)}
          {@render itemRow(it)}
        {/each}

        {#if canVote}
          {#if addKey === key}
            {@render addForm(decisions)}
          {:else}
            <button
              type="button"
              onclick={() => openAdd(key)}
              class="self-start rounded-full px-2.5 py-1 font-body text-[13px] font-extrabold text-coral-600 transition hover:bg-coral-100"
            >＋ {decisions ? 'Add a decision' : 'Add entry'}</button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet itemRow(/** @type {ItinItem} */ it)}
  {#if editId === it.id}
    <div class="flex flex-col gap-2 rounded-lg border-2 border-coral-200 bg-sand-100 p-2.5">
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          bind:value={eTime}
          placeholder="time"
          maxlength="40"
          class="rounded-md border-2 border-sand-300 bg-white px-2.5 py-1.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400 sm:w-24"
        />
        <input
          bind:value={eLabel}
          maxlength="200"
          onkeydown={(e) => e.key === 'Enter' && submitEdit()}
          class="flex-1 rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
        />
      </div>
      <input
        bind:value={ePlace}
        placeholder="📍 Navigate to… (place, address, or lat,lng)"
        maxlength="300"
        onkeydown={(e) => e.key === 'Enter' && submitEdit()}
        class="rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[13.5px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
      />
      <div class="flex items-center justify-between gap-2">
        {@render kindToggle(eKind, (k) => (eKind = k))}
        <div class="flex gap-2">
          <Button variant="soft" size="sm" onclick={submitEdit} disabled={busy || !eLabel.trim()}>Save</Button>
          <Button variant="ghost" size="sm" onclick={() => (editId = '')} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </div>
  {:else}
    <div class="group flex items-center gap-2 rounded-lg border-2 border-sand-200 bg-white px-2.5 py-2">
      {#if it.time}
        <span class="flex-none rounded-full px-2 py-0.5 font-body text-[12px] font-extrabold {it.kind === 'fixed' ? 'bg-sand-300 text-cocoa-700' : 'bg-sand-200 text-cocoa-600'}">{it.time}</span>
      {:else if it.kind === 'fixed'}
        <span class="flex-none text-[13px]" title="Fixed entry" aria-hidden="true">📌</span>
      {/if}

      <span class="min-w-0 flex-1 truncate font-body text-[14.5px] font-extrabold text-cocoa-900">{it.label}</span>

      <!-- Right cluster: navigate · upvote (flexible only) · creator avatar · hover manage. -->
      {#if it.place}
        <a
          href={navUrl(it.place, mapApp)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Navigate to {it.place}"
          title="Navigate — {it.place}"
          class="flex flex-none items-center gap-1 rounded-full bg-coral-100 px-2 py-1 font-body text-[12px] font-extrabold text-coral-600 transition hover:bg-coral-500 hover:text-white"
        >
          <span class="leading-none" aria-hidden="true">🧭</span>
          <span class="hidden leading-none sm:inline">Navigate</span>
        </a>
      {/if}

      {#if it.kind === 'flexible'}
        <button
          type="button"
          onclick={() => canVote && vote(it.id)}
          disabled={busy || !canVote}
          aria-pressed={it.mine}
          aria-label="Upvote"
          class="flex flex-none items-center gap-1 rounded-full px-2 py-1 font-body text-[12px] font-bold transition {it.mine ? 'bg-coral-500 text-white' : 'bg-sand-100 text-cocoa-600'} {canVote ? 'hover:bg-coral-100' : ''}"
        >
          <span class="leading-none">▲</span>
          <span class="font-display leading-none">{it.votes}</span>
        </button>
      {/if}

      {#if it.createdByName}
        <Tooltip label="Added by {it.createdByName}" placement="top">
          <span class="flex-none"><Avatar name={it.createdByName} src={it.createdByAvatar} size={22} /></span>
        </Tooltip>
      {/if}

      {#if canManage(it)}
        <span class="flex flex-none items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button type="button" aria-label="Edit" onclick={() => openEdit(it)} class="rounded-full px-1.5 font-body text-[12px] font-bold text-cocoa-400 hover:text-coral-600">Edit</button>
          <button type="button" aria-label="Remove" onclick={() => removeItem(it.id)} disabled={busy} class="rounded-full px-1.5 font-body text-[12px] font-bold text-cocoa-400 hover:text-berry-600">✕</button>
        </span>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet addForm(/** @type {boolean} */ decisions)}
  <div class="flex flex-col gap-2 rounded-lg bg-sand-100 p-2.5">
    <div class="flex flex-col gap-2 sm:flex-row">
      {#if !decisions}
        <input
          bind:value={niTime}
          placeholder="time"
          maxlength="40"
          class="rounded-md border-2 border-sand-300 bg-white px-2.5 py-2 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400 sm:w-24"
        />
      {/if}
      <input
        bind:value={niLabel}
        placeholder={decisions ? 'What should the group decide?' : niKind === 'fixed' ? 'Check-in, dinner reservation…' : 'Beach day, mini golf…'}
        maxlength="200"
        onkeydown={(e) => e.key === 'Enter' && submitAdd()}
        class="flex-1 rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
      />
    </div>
    <input
      bind:value={niPlace}
      placeholder="📍 Navigate to… (place, address, or lat,lng) — optional"
      maxlength="300"
      onkeydown={(e) => e.key === 'Enter' && submitAdd()}
      class="rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[13.5px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
    />
    <div class="flex items-center justify-between gap-2">
      {#if !decisions}
        {@render kindToggle(niKind, (k) => (niKind = k))}
      {:else}
        <span class="font-body text-[12px] font-bold text-cocoa-400">People upvote to show interest</span>
      {/if}
      <div class="flex gap-2">
        <Button variant="soft" size="sm" onclick={submitAdd} disabled={busy || !niLabel.trim()}>Add</Button>
        <Button variant="ghost" size="sm" onclick={() => (addKey = null)} disabled={busy}>Cancel</Button>
      </div>
    </div>
  </div>
{/snippet}

{#snippet kindToggle(/** @type {'fixed'|'flexible'} */ value, /** @type {(k: 'fixed'|'flexible') => void} */ set)}
  <div class="flex gap-1" role="group" aria-label="Entry type">
    <button
      type="button"
      onclick={() => set('flexible')}
      class="rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold transition {value === 'flexible' ? 'bg-coral-500 text-white' : 'bg-white text-cocoa-600 hover:bg-sand-200'}"
    >💡 Suggestion</button>
    <button
      type="button"
      onclick={() => set('fixed')}
      class="rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold transition {value === 'fixed' ? 'bg-cocoa-700 text-white' : 'bg-white text-cocoa-600 hover:bg-sand-200'}"
    >📌 Fixed</button>
  </div>
{/snippet}
