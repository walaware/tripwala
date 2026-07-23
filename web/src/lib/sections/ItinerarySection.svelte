<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction, tripUpload } from '$lib/tripClient.js';
  import { Card, Avatar, Button, EmptyState, Tooltip } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { tripDays, fmtWeekday, fmtMonthDay, fmtDateRange, tripLength } from '$lib/format.js';
  import { navUrl } from '$lib/maps.js';
  import { cardImage, cardDomain } from '$lib/locationCard.js';

  /**
   * @typedef {{ id: string, date: string, time: string, label: string, place: string, note: string, url: string, image: string, previewImage: string, previewTitle: string, previewDescription: string, kind: 'fixed'|'flexible', sortOrder: number, createdBy: string|null, createdByName: string|null, createdByAvatar: string, votes: number, mine: boolean }} ItinItem
   */

  /**
   * @type {{
   *   shareToken: string,
   *   itineraryItems: ItinItem[],
   *   mapApp?: 'apple'|'google',
   *   trip: { start_date?: string, end_date?: string },
   *   cities?: Array<{ id: string, name: string, start_date: string, end_date: string, sortOrder: number }>,
   *   currentParticipantId: string | null,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let {
    shareToken,
    itineraryItems,
    mapApp = 'apple',
    trip,
    cities = [],
    currentParticipantId,
    ownerMode = false,
    onHide = null,
    onSettings = null,
    collapsed = false,
    onToggle = null
  } = $props();

  // Cities (#3): dated segments that band the itinerary. The city for a day is
  // derived from date ranges (mirrors $lib/server/cities.js cityForDate — kept
  // inline because $lib/server can't be imported into a client component).
  /** @param {string} date YYYY-MM-DD */
  function cityIdForDate(date) {
    const d = String(date ?? '').slice(0, 10);
    if (!d) return null;
    /** @type {string | null} */
    let match = null;
    for (const c of cities) {
      if (!c.start_date) continue;
      if (c.start_date <= d && (!c.end_date || c.end_date >= d)) match = c.id;
    }
    return match;
  }
  const cityById = $derived(Object.fromEntries(cities.map((c) => [c.id, c])));

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
  // Distinct days that actually have something planned — the density headline.
  const plannedDays = $derived(groups.filter((g) => g.items.length).length);

  // Annotate each day group with its city (used to build the city sections).
  const bandedGroups = $derived.by(() =>
    groups.map((g) => ({ ...g, cityId: cityIdForDate(g.key) }))
  );

  /** @param {string} key YYYY-MM-DD */
  const isoOf = (key) => `${key}T00:00:00.000Z`;
  /** Short "Sun 26" chip label for an open day. @param {string} key */
  const chipLabel = (key) => `${fmtWeekday(isoOf(key))} ${Number(key.slice(8, 10))}`;

  /**
   * @typedef {{ key: string, cityId: string | null, dayGroups: Array<{ key: string, label: string, items: ItinItem[] }>, openDays: Array<{ key: string, chip: string }>, openLabel: string }} CitySection
   */

  // Density: only planned days render as rows. Empty days within a city collapse
  // into that city's ONE dashed "N open days" row (expandable to per-day chips).
  const citySections = $derived.by(() => {
    /** @type {CitySection[]} */
    const secs = [];
    /** @type {CitySection | null} */
    let cur = null;
    for (const g of bandedGroups) {
      if (!cur || g.cityId !== cur.cityId) {
        cur = { key: g.cityId ?? '__none__', cityId: g.cityId, dayGroups: [], openDays: [], openLabel: '' };
        secs.push(cur);
      }
      if (g.items.length) cur.dayGroups.push({ key: g.key, label: g.label, items: g.items });
      else cur.openDays.push({ key: g.key, chip: chipLabel(g.key) });
    }
    for (const s of secs) {
      const n = s.openDays.length;
      if (!n) continue;
      if (!s.dayGroups.length) s.openLabel = `Nothing planned yet · ${n} open day${n === 1 ? '' : 's'}`;
      else if (n === 1) s.openLabel = `${s.openDays[0].chip} · 1 open day`;
      else s.openLabel = `${s.openDays[0].chip} → ${s.openDays[n - 1].chip} · ${n} open days`;
    }
    return secs;
  });

  // Cities already shown as band headers below — so the management block at the
  // top only needs to surface the ones that AREN'T banded (undated cities, or
  // cities whose range falls entirely outside the trip's days). Avoids showing
  // each city twice (management chip + band header).
  const bandedCityIds = $derived(new Set(citySections.map((s) => s.cityId).filter(Boolean)));
  const orphanCities = $derived(cities.filter((c) => !bandedCityIds.has(c.id)));

  // Per-city expansion of the collapsed open-days row (plain state, no Disclosure).
  /** @type {Set<string>} */
  let expandedCities = $state(new Set());
  /** @param {string} key */
  function toggleCity(key) {
    const next = new Set(expandedCities);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedCities = next;
  }

  let busy = $state(false);

  // City add/edit forms (organizer only). One open at a time.
  let cityFormOpen = $state(false);
  let cityEditId = $state('');
  let cName = $state('');
  let cStart = $state('');
  let cEnd = $state('');
  function openCityAdd() {
    cityEditId = '';
    cityFormOpen = true;
    cName = '';
    cStart = '';
    cEnd = '';
  }
  /** @param {{ id: string, name: string, start_date: string, end_date: string }} c */
  function openCityEdit(c) {
    cityFormOpen = false;
    cityEditId = c.id;
    cName = c.name;
    cStart = c.start_date;
    cEnd = c.end_date;
  }
  function closeCityForm() {
    cityFormOpen = false;
    cityEditId = '';
  }
  async function submitCity() {
    if (!cName.trim()) return;
    const body = { name: cName.trim(), start_date: cStart, end_date: cEnd };
    if (cityEditId) await run({ op: 'city_update', cityId: cityEditId, ...body });
    else await run({ op: 'city_add', ...body });
    closeCityForm();
  }
  /** @param {string} cityId */
  const removeCity = (cityId) => run({ op: 'city_remove', cityId });

  // One open "add" form at a time, keyed by day ('' = the To-decide bucket).
  /** @type {string | null} */
  let addKey = $state(null);
  let niLabel = $state('');
  let niTime = $state('');
  let niPlace = $state('');
  let niNote = $state('');
  let niUrl = $state('');
  /** @type {'fixed'|'flexible'} */
  let niKind = $state('flexible');
  // One open item editor at a time.
  let editId = $state('');
  let eLabel = $state('');
  let eTime = $state('');
  let ePlace = $state('');
  let eNote = $state('');
  let eUrl = $state('');
  /** @type {'fixed'|'flexible'} */
  let eKind = $state('flexible');

  // Per-item photo upload (#to-decide-cards): one hidden input, aimed at one
  // item at a time, mirroring PlanLocationSection's camera flow.
  /** @type {HTMLInputElement | undefined} */
  let fileInput = $state();
  let uploadTargetId = $state('');
  let uploadingId = $state('');
  let mediaError = $state('');

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
    niNote = '';
    niUrl = '';
    niKind = 'flexible';
  }
  async function submitAdd() {
    if (!niLabel.trim() || addKey === null) return;
    const date = addKey || undefined;
    // Undated entries are always suggestions (decisions to vote on).
    const kind = addKey === '' ? 'flexible' : niKind;
    await run({ op: 'itin_item_add', label: niLabel.trim(), time: niTime.trim(), place: niPlace.trim(), note: niNote.trim(), url: niUrl.trim(), date, kind });
    addKey = null;
  }

  /** @param {ItinItem} it */
  function openEdit(it) {
    editId = it.id;
    eLabel = it.label;
    eTime = it.time;
    ePlace = it.place;
    eNote = it.note;
    eUrl = it.url;
    eKind = it.kind;
  }
  async function submitEdit() {
    if (!eLabel.trim()) return;
    const id = editId;
    await run({ op: 'itin_item_update', itemId: id, label: eLabel.trim(), time: eTime.trim(), place: ePlace.trim(), note: eNote.trim(), url: eUrl.trim(), kind: eKind });
    editId = '';
  }

  /** @param {string} itemId */
  const vote = (itemId) => run({ op: 'itin_vote', itemId });
  /** @param {string} itemId */
  const removeItem = (itemId) => run({ op: 'itin_item_remove', itemId });

  // ---- Photo upload (creator or organizer; same rule as edit/remove) ----
  /** @param {string} id */
  function pickPhotoFor(id) {
    uploadTargetId = id;
    mediaError = '';
    fileInput?.click();
  }
  /** @param {Event} e */
  async function onFileChange(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    input.value = '';
    if (file) await doUpload(uploadTargetId, file);
  }
  /** @param {string} id @param {File} file */
  async function doUpload(id, file) {
    if (!file.type.startsWith('image/')) {
      mediaError = 'That needs to be an image (JPG, PNG…).';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      mediaError = 'Image must be under 5 MB.';
      return;
    }
    uploadingId = id;
    mediaError = '';
    try {
      await tripUpload(shareToken, { op: 'itin_item_image', itemId: id }, file);
      await invalidateAll();
    } catch (_) {
      mediaError = 'Could not upload that image — try a different one.';
    } finally {
      uploadingId = '';
    }
  }
  /** @param {string} itemId */
  const removePhoto = (itemId) => run({ op: 'itin_item_image_remove', itemId });
</script>

<SectionHeader emoji="🗓️" title="What's the plan?" subtitle={plannedDays ? `${plannedDays} day${plannedDays === 1 ? '' : 's'} planned` : ''} {onHide} {onSettings} {collapsed} {onToggle} />
<Card>
  {#if mediaError}
    <p class="mb-2 rounded-lg bg-berry-200 px-3 py-2 font-body text-xs font-bold text-berry-600">{mediaError}</p>
  {/if}

  <!-- One hidden input drives every item's "📷" photo upload. -->
  <input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={onFileChange} />

  <!-- The trip dates lead the plan (no separate Dates section). -->
  <div class="mb-3 flex items-baseline gap-2.5">
    <span class="font-display text-[20px] font-bold text-text-strong">{range || 'Dates TBD'}</span>
    {#if len.nights > 0}
      <span class="font-body text-[13px] font-extrabold text-text-muted">{len.nights} night{len.nights === 1 ? '' : 's'}</span>
    {/if}
  </div>

  <!-- Cities (#3): dated legs of a multi-stop trip. Each city renders once as a
       band header over its days below (with organizer edit/remove there). This
       top block only surfaces the "＋ Add city" control, the add form, and any
       cities that AREN'T banded below (undated / out-of-range) — so a city never
       shows twice. -->
  {#if orphanCities.length || ownerMode}
    <div class="mb-3">
      {#if orphanCities.length || (ownerMode && !cityFormOpen && !cityEditId)}
        <div class="flex flex-wrap items-center gap-1.5">
          {#each orphanCities as c (c.id)}
            <span class="group inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 font-body text-[12.5px] font-extrabold text-sky-700">
              <span aria-hidden="true">📍</span>
              <span>{c.name}</span>
              {#if c.start_date}
                <span class="font-bold text-sky-600/80">· {fmtDateRange(`${c.start_date}T00:00:00.000Z`, c.end_date ? `${c.end_date}T00:00:00.000Z` : '')}</span>
              {/if}
              {#if ownerMode}
                <button type="button" aria-label="Edit city" onclick={() => openCityEdit(c)} class="ml-0.5 text-sky-500 hover:text-sky-800">✎</button>
                <button type="button" aria-label="Remove city" onclick={() => removeCity(c.id)} disabled={busy} class="text-sky-500 hover:text-berry-600">✕</button>
              {/if}
            </span>
          {/each}
          {#if ownerMode && !cityFormOpen && !cityEditId}
            <button type="button" onclick={openCityAdd} class="rounded-full px-2.5 py-1 font-body text-[12.5px] font-extrabold text-sky-600 transition hover:bg-sky-100">＋ Add city</button>
          {/if}
        </div>
      {/if}

      <!-- The add form, and edits of orphan (non-banded) cities, render here;
           edits of a banded city render under its band header below. -->
      {#if ownerMode && (cityFormOpen || (cityEditId && orphanCities.some((c) => c.id === cityEditId)))}
        {@render cityForm()}
      {/if}
    </div>
  {/if}

  <!-- Open decisions surface at the TOP: undated suggestions the crew upvotes
       (primary-soft block), not buried at the bottom of the plan. -->
  {#if undated.length || canVote}
    <div class="mb-4 rounded-xl p-3" style="background: var(--color-primary-soft)">
      <div class="mb-2 flex items-center gap-2 px-0.5">
        <span class="font-display text-[14px] font-bold" style="color: var(--color-primary-press, var(--color-coral-700))">🤔 To decide</span>
        <span class="h-px flex-1" style="background: color-mix(in srgb, var(--color-primary-press, #b45309) 20%, transparent)"></span>
      </div>
      <div class="flex flex-col gap-1.5">
        {#each undated as it (it.id)}
          {@render itemRow(it)}
        {/each}
        {#if canVote}
          {#if addKey === ''}
            {@render addForm(true)}
          {:else}
            <button
              type="button"
              onclick={() => openAdd('')}
              class="self-start rounded-full px-2.5 py-1 font-body text-[13px] font-extrabold text-coral-600 transition hover:bg-coral-100"
            >＋ Add a decision</button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if !days.length && !total}
    <EmptyState
      emoji="🗓️"
      title="No plan yet"
      body="Add fixed entries like check-in & check-out, or suggest flexible ideas the crew can upvote."
    />
  {/if}

  <div class="flex flex-col gap-4">
    {#each citySections as sec (sec.key)}
      {#if sec.cityId && cityById[sec.cityId]}
        {@const c = cityById[sec.cityId]}
        {@const nights = tripLength(c.start_date, c.end_date).nights}
        <div class="group flex items-center gap-2 pt-1">
          <span class="font-display text-[15px] font-bold text-sky-700">📍 {c.name}</span>
          {#if c.start_date}
            <span class="font-body text-[12.5px] font-extrabold text-sky-600/80">
              {fmtDateRange(isoOf(c.start_date), c.end_date ? isoOf(c.end_date) : '')}{#if nights > 0} · {nights} night{nights === 1 ? '' : 's'}{/if}
            </span>
          {/if}
          {#if ownerMode}
            <span class="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              <button type="button" aria-label="Edit city" onclick={() => openCityEdit(c)} class="text-sky-500 hover:text-sky-800">✎</button>
              <button type="button" aria-label="Remove city" onclick={() => removeCity(c.id)} disabled={busy} class="text-sky-500 hover:text-berry-600">✕</button>
            </span>
          {/if}
          <span class="h-px flex-1 bg-sky-200"></span>
        </div>
        {#if ownerMode && cityEditId === sec.cityId}
          {@render cityForm()}
        {/if}
      {/if}
      {#each sec.dayGroups as g (g.key)}
        {@render dayGroup(g.key, g.label, g.items)}
      {/each}
      {#if sec.openLabel && canVote}
        {@render openDaysRow(sec)}
      {/if}
    {/each}
  </div>
</Card>

{#snippet cityForm()}
  <div class="mt-2 flex flex-col gap-2 rounded-lg bg-sand-100 p-2.5 sm:flex-row sm:items-end">
    <div class="flex-1">
      <label class="mb-0.5 block font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400" for="city-name">City</label>
      <input
        id="city-name"
        bind:value={cName}
        placeholder="Tokyo"
        maxlength="120"
        onkeydown={(e) => e.key === 'Enter' && submitCity()}
        class="w-full rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-sky-400"
      />
    </div>
    <div>
      <label class="mb-0.5 block font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400" for="city-start">Arrive</label>
      <input id="city-start" type="date" bind:value={cStart} class="rounded-md border-2 border-sand-300 bg-white px-2.5 py-1.5 font-body text-[13px] font-bold text-cocoa-900 outline-none focus:border-sky-400" />
    </div>
    <div>
      <label class="mb-0.5 block font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400" for="city-end">Leave</label>
      <input id="city-end" type="date" bind:value={cEnd} min={cStart} class="rounded-md border-2 border-sand-300 bg-white px-2.5 py-1.5 font-body text-[13px] font-bold text-cocoa-900 outline-none focus:border-sky-400" />
    </div>
    <div class="flex gap-2">
      <Button variant="soft" size="sm" onclick={submitCity} disabled={busy || !cName.trim()}>{cityEditId ? 'Save' : 'Add'}</Button>
      <Button variant="ghost" size="sm" onclick={closeCityForm} disabled={busy}>Cancel</Button>
    </div>
  </div>
{/snippet}

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

{#snippet openDaysRow(/** @type {CitySection} */ sec)}
  {@const expanded = expandedCities.has(sec.key)}
  {#if !expanded}
    <button
      type="button"
      onclick={() => toggleCity(sec.key)}
      class="self-start rounded-full border-2 border-dashed border-sand-300 px-3 py-1.5 font-body text-[13px] font-extrabold text-cocoa-500 transition hover:border-coral-300 hover:text-coral-600"
    >＋ {sec.openLabel}</button>
  {:else}
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        {#each sec.openDays as d (d.key)}
          <button
            type="button"
            onclick={() => openAdd(d.key)}
            class="rounded-full border-2 border-dashed px-2.5 py-1 font-body text-[12.5px] font-extrabold transition hover:border-coral-300 hover:text-coral-600 {addKey === d.key ? 'border-coral-400 text-coral-600' : 'border-sand-300 text-cocoa-500'}"
          >＋ {d.chip}</button>
        {/each}
        <button
          type="button"
          onclick={() => toggleCity(sec.key)}
          class="px-2 py-1 font-body text-[12.5px] font-extrabold text-cocoa-400 hover:text-cocoa-600"
        >collapse</button>
      </div>
      {#if addKey !== null && sec.openDays.some((d) => d.key === addKey)}
        {@render addForm(false)}
      {/if}
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
      <input
        bind:value={eUrl}
        placeholder="🔗 Link (optional) — we'll grab a preview"
        maxlength="500"
        onkeydown={(e) => e.key === 'Enter' && submitEdit()}
        class="rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[13.5px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
      />
      <textarea
        bind:value={eNote}
        placeholder="Details (optional) — the why / how, shown beneath the title"
        maxlength="600"
        rows="2"
        class="resize-y rounded-md border-2 border-sand-300 bg-white px-3 py-1.5 font-body text-[13.5px] font-semibold text-cocoa-900 outline-none focus:border-coral-400"
      ></textarea>
      <div class="flex items-center justify-between gap-2">
        {@render kindToggle(eKind, (k) => (eKind = k))}
        <div class="flex gap-2">
          <Button variant="soft" size="sm" onclick={submitEdit} disabled={busy || !eLabel.trim()}>Save</Button>
          <Button variant="ghost" size="sm" onclick={() => (editId = '')} disabled={busy}>Cancel</Button>
        </div>
      </div>
    </div>
  {:else}
    {@const img = cardImage(it)}
    <div class="group flex flex-col gap-1 rounded-lg border-2 border-sand-200 bg-white px-2.5 py-2">
      <div class="flex items-center gap-2">
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

      <!-- Rich media (#to-decide-cards): a photo (uploaded > unfurled preview)
           and/or a link give a decision like "where do we eat tonight" the same
           depth planning's location cards have. Only rendered when present. -->
      {#if img.src}
        <div class="relative mt-1 h-28 w-full overflow-hidden rounded-lg">
          <img src={img.src} alt={it.label} class="h-full w-full object-cover" loading="lazy" />
          {#if uploadingId === it.id}
            <div class="absolute inset-0 grid place-items-center bg-cocoa-900/40 font-body text-xs font-extrabold text-white">Uploading…</div>
          {/if}
        </div>
      {/if}

      {#if it.note}
        <p class="whitespace-pre-line font-body text-[13px] font-semibold leading-snug text-cocoa-600">{it.note}</p>
      {/if}

      {#if it.url || canManage(it)}
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
          {#if it.url}
            <a href={it.url} target="_blank" rel="noopener noreferrer" class="truncate font-body text-[12px] font-extrabold text-coral-600 underline">{cardDomain(it.url) || 'link'} ↗</a>
          {/if}
          {#if canManage(it)}
            <button
              type="button"
              onclick={() => pickPhotoFor(it.id)}
              disabled={busy || uploadingId === it.id}
              class="font-body text-[12px] font-extrabold text-cocoa-400 transition hover:text-coral-600"
            >📷 {img.isCustom ? 'Replace photo' : 'Add photo'}</button>
            {#if img.isCustom}
              <button
                type="button"
                onclick={() => removePhoto(it.id)}
                disabled={busy}
                class="font-body text-[12px] font-extrabold text-cocoa-400 transition hover:text-berry-600"
              >Remove photo</button>
            {/if}
          {/if}
        </div>
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
    <input
      bind:value={niUrl}
      placeholder="🔗 Link (optional) — we'll grab a preview"
      maxlength="500"
      onkeydown={(e) => e.key === 'Enter' && submitAdd()}
      class="rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[13.5px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
    />
    <textarea
      bind:value={niNote}
      placeholder="Details (optional) — the why / how, shown beneath the title"
      maxlength="600"
      rows="2"
      class="resize-y rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[13.5px] font-semibold text-cocoa-900 outline-none focus:border-coral-400"
    ></textarea>
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
