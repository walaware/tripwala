<script>
  // Trip map (#12) — a first-class map for any trip type. Members drop pins
  // (campsite, meetup, parking, …) by searching a place or tapping the map.
  // Leaflet + OpenStreetMap tiles (no API key); geocoding is proxied server-side
  // (see /[share_token]/geocode). Leaflet is browser-only, so it's imported in
  // onMount; markers re-sync from `mapPins` whenever the loader refreshes.
  import 'leaflet/dist/leaflet.css';
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { Card, Button } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { tripAction } from '$lib/tripClient.js';
  import { hasCoords } from '$lib/coords.js';

  /**
   * @type {{
   *   shareToken: string,
   *   trip: any,
   *   mapPins: Array<{ id: string, label: string, category: string, lat: number, lng: number, note: string, createdBy: string | null, createdByName: string | null }>,
   *   currentParticipantId?: string | null,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let {
    shareToken,
    trip,
    mapPins = [],
    currentParticipantId = null,
    ownerMode = false,
    onHide = null,
    onSettings = null,
    collapsed = false,
    onToggle = null
  } = $props();

  /** category → [emoji, label] */
  const CATS = /** @type {const} */ ([
    ['campsite', '🏕️', 'Campsite'],
    ['lodging', '🛏️', 'Lodging'],
    ['meetup', '📍', 'Meetup point'],
    ['parking', '🅿️', 'Parking'],
    ['trailhead', '🥾', 'Trailhead'],
    ['gas', '⛽', 'Gas'],
    ['food', '🍽️', 'Food'],
    ['water', '🚰', 'Water'],
    ['viewpoint', '🌄', 'Viewpoint'],
    ['other', '📌', 'Other']
  ]);
  /** @param {string} c */
  const emojiOf = (c) => (CATS.find(([k]) => k === c) ?? CATS[CATS.length - 1])[1];

  // ---- Leaflet (set up in onMount; kept out of $state so they don't churn) ----
  /** @type {any} */ let L = null;
  /** @type {any} */ let map = null;
  /** @type {any} */ let pinLayer = null;
  /** @type {any} */ let draftMarker = null;
  /** @type {HTMLDivElement | undefined} */ let mapEl;
  let ready = $state(false);

  let selectedId = $state('');
  let busy = $state('');

  // The add/edit form. `open` shows it; `mode` switches the action + copy.
  let form = $state({ open: false, mode: 'add', id: '', label: '', category: 'meetup', note: '', lat: 0, lng: 0 });
  let placing = $state(false); // "tap the map to place" armed

  // Search (server-proxied Nominatim).
  let q = $state('');
  let searching = $state(false);
  /** @type {Array<{ label: string, lat: number, lng: number }>} */
  let results = $state([]);
  let searchError = $state('');

  const canDelete = (/** @type {{ createdBy: string | null }} */ p) =>
    ownerMode || (p.createdBy && p.createdBy === currentParticipantId);

  onMount(() => {
    let cancelled = false;
    (async () => {
      L = (await import('leaflet')).default;
      if (cancelled || !mapEl) return;
      map = L.map(mapEl, { scrollWheelZoom: false }).setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      pinLayer = L.layerGroup().addTo(map);

      // Tapping the map while "placing" sets the new pin's location.
      map.on('click', (/** @type {any} */ e) => {
        if (!placing) return;
        openForm('add', { lat: e.latlng.lat, lng: e.latlng.lng });
        placing = false;
      });

      ready = true;
      // Initial framing: fit to existing pins, else center on the trip location.
      if (mapPins.length) fitToPins();
      else void centerOnTripLocation();
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
      map = null;
    };
  });

  function fitToPins() {
    if (!map || !mapPins.length) return;
    const b = L.latLngBounds(mapPins.map((p) => [p.lat, p.lng]));
    map.fitBounds(b, { padding: [40, 40], maxZoom: 14 });
  }

  async function centerOnTripLocation() {
    // A pinned trip centres on its exact coordinates — no re-geocoding, so the
    // map lands on the same spot the weather forecast uses.
    if (hasCoords(trip?.lat, trip?.lng)) {
      if (map) map.setView([trip.lat, trip.lng], 11);
      return;
    }
    const loc = (trip?.location || '').trim();
    if (!loc) return;
    try {
      const res = await fetch(`/${encodeURIComponent(shareToken)}/geocode?q=${encodeURIComponent(loc)}`);
      if (!res.ok) return;
      const { results: r } = await res.json();
      if (r?.[0] && map) map.setView([r[0].lat, r[0].lng], 11);
    } catch (_) {
      /* leave the default world view */
    }
  }

  // Redraw markers whenever the pin set or selection changes (and once ready).
  $effect(() => {
    const pins = mapPins;
    const sel = selectedId;
    if (!ready || !pinLayer || !L) return;
    pinLayer.clearLayers();
    for (const p of pins) {
      const isSel = p.id === sel;
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin-bubble${isSel ? ' is-selected' : ''}">${emojiOf(p.category)}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30]
        })
      });
      marker.on('click', () => (selectedId = p.id));
      pinLayer.addLayer(marker);
    }
  });

  // A draggable draft marker while adding/editing, so the spot can be fine-tuned.
  $effect(() => {
    const showing = form.open;
    const lat = form.lat;
    const lng = form.lng;
    if (!ready || !L || !map) return;
    if (draftMarker) {
      draftMarker.remove();
      draftMarker = null;
    }
    if (showing && Number.isFinite(lat) && Number.isFinite(lng)) {
      draftMarker = L.marker([lat, lng], {
        draggable: true,
        icon: L.divIcon({ className: '', html: `<div class="pin-bubble is-draft">${emojiOf(form.category)}</div>`, iconSize: [30, 30], iconAnchor: [15, 30] })
      }).addTo(map);
      draftMarker.on('dragend', () => {
        const ll = draftMarker.getLatLng();
        form = { ...form, lat: ll.lat, lng: ll.lng };
      });
    }
  });

  /** @param {'add'|'edit'} mode @param {Partial<typeof form>} init */
  function openForm(mode, init) {
    form = {
      open: true,
      mode,
      id: init.id ?? '',
      label: init.label ?? '',
      category: init.category ?? 'meetup',
      note: init.note ?? '',
      lat: init.lat ?? 0,
      lng: init.lng ?? 0
    };
    if (map && Number.isFinite(form.lat) && Number.isFinite(form.lng)) {
      map.panTo([form.lat, form.lng]);
    }
  }
  function closeForm() {
    form = { ...form, open: false };
  }

  async function runSearch() {
    const query = q.trim();
    if (query.length < 2 || searching) return;
    searching = true;
    searchError = '';
    try {
      const res = await fetch(`/${encodeURIComponent(shareToken)}/geocode?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(String(res.status));
      results = (await res.json()).results ?? [];
      if (!results.length) searchError = 'No places found.';
    } catch (_) {
      searchError = 'Search is unavailable — try again.';
      results = [];
    } finally {
      searching = false;
    }
  }

  /** @param {{ label: string, lat: number, lng: number }} r */
  function pickResult(r) {
    if (map) map.setView([r.lat, r.lng], 14);
    // Prefill the label with the place's leading name (before the first comma).
    openForm('add', { lat: r.lat, lng: r.lng, label: r.label.split(',')[0].slice(0, 80) });
    results = [];
    q = '';
  }

  async function saveForm() {
    if (!form.label.trim() || busy) return;
    busy = 'save';
    const op = form.mode === 'edit' ? 'pin_update' : 'pin_add';
    try {
      await tripAction(shareToken, {
        op,
        pinId: form.id,
        label: form.label.trim(),
        category: form.category,
        note: form.note.trim(),
        lat: form.lat,
        lng: form.lng
      });
      closeForm();
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  /** @param {{ id: string, label: string, category: string, note: string, lat: number, lng: number }} p */
  function editPin(p) {
    selectedId = p.id;
    openForm('edit', { id: p.id, label: p.label, category: p.category, note: p.note, lat: p.lat, lng: p.lng });
  }

  /** @param {string} id */
  async function deletePin(id) {
    if (busy) return;
    busy = 'del-' + id;
    try {
      await tripAction(shareToken, { op: 'pin_delete', pinId: id });
      if (selectedId === id) selectedId = '';
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }

  /** @param {{ lat: number, lng: number, id: string }} p */
  function focusPin(p) {
    selectedId = p.id;
    if (map) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 14));
  }

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-2.5 font-body text-[14.5px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
</script>

<SectionHeader emoji="🗺️" title="Map" subtitle="— pins & places" {onHide} {onSettings} {collapsed} {onToggle} />
<Card>
  <!-- Search a place -->
  <div class="flex gap-2">
    <input
      bind:value={q} placeholder="Search a place (address, park, town…)"
      class="{inputClass} flex-1"
      onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), runSearch())}
    />
    <Button variant="soft" size="md" onclick={runSearch} disabled={q.trim().length < 2 || searching}>
      {searching ? '…' : 'Search'}
    </Button>
  </div>
  {#if searchError}<p class="mt-1.5 font-body text-[12.5px] font-bold text-cocoa-500">{searchError}</p>{/if}
  {#if results.length}
    <div class="mt-2 flex flex-col overflow-hidden rounded-xl border-2 border-sand-200">
      {#each results as r, i (r.label + i)}
        <button
          type="button" onclick={() => pickResult(r)}
          class="border-sand-200 px-3 py-2 text-left font-body text-[13px] font-bold text-cocoa-800 hover:bg-sand-100 {i !== 0 ? 'border-t' : ''}"
        >{r.label}</button>
      {/each}
    </div>
  {/if}

  <!-- The map -->
  <div bind:this={mapEl} class="mt-3 h-72 w-full overflow-hidden rounded-2xl border-2 border-sand-200 sm:h-96" aria-label="Trip map"></div>

  <div class="mt-2 flex items-center justify-between gap-2">
    <span class="font-body text-[12px] font-bold text-cocoa-400">
      {placing ? 'Tap the map to drop the pin…' : `${mapPins.length} pin${mapPins.length === 1 ? '' : 's'}`}
    </span>
    <Button variant={placing ? 'ghost' : 'soft'} size="sm" onclick={() => (placing = !placing, closeForm())}>
      {placing ? 'Cancel' : '＋ Drop a pin'}
    </Button>
  </div>

  <!-- Add / edit form -->
  {#if form.open}
    <div class="mt-3 rounded-2xl bg-sand-100 p-3.5">
      <div class="mb-2 font-display text-[14px] font-bold text-cocoa-900">{form.mode === 'edit' ? 'Edit pin' : 'New pin'}</div>
      <input bind:value={form.label} placeholder="Label (e.g. Site 14, trailhead)" class="{inputClass}" />
      <div class="mt-2 flex gap-2">
        <select bind:value={form.category} class="{inputClass} flex-1">
          {#each CATS as [key, emoji, label]}
            <option value={key}>{emoji} {label}</option>
          {/each}
        </select>
      </div>
      <input bind:value={form.note} placeholder="Note (optional)" class="{inputClass} mt-2" />
      <p class="mt-2 font-body text-[11.5px] font-bold text-cocoa-400">Drag the pin on the map to fine-tune the spot.</p>
      <div class="mt-2.5 flex gap-2">
        <Button variant="primary" size="md" onclick={saveForm} disabled={!form.label.trim() || busy === 'save'}>
          {busy === 'save' ? 'Saving…' : form.mode === 'edit' ? 'Save' : 'Add pin'}
        </Button>
        <Button variant="ghost" size="md" onclick={closeForm}>Cancel</Button>
      </div>
    </div>
  {/if}

  <!-- Pin list -->
  {#if mapPins.length}
    <div class="mt-3 flex flex-col gap-1.5">
      {#each mapPins as p (p.id)}
        <div class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 {p.id === selectedId ? 'bg-coral-100' : 'bg-sand-100'}">
          <button type="button" onclick={() => focusPin(p)} class="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <span class="text-[18px] leading-none">{emojiOf(p.category)}</span>
            <span class="min-w-0">
              <span class="block truncate font-body text-[14px] font-extrabold text-cocoa-900">{p.label}</span>
              {#if p.note}<span class="block truncate font-body text-[12.5px] font-bold text-cocoa-500">{p.note}</span>{/if}
            </span>
          </button>
          <button
            type="button" title="Edit" onclick={() => editPin(p)}
            class="shrink-0 rounded-full px-2 py-1 font-body text-[12px] font-extrabold text-cocoa-500 hover:bg-sand-200"
          >Edit</button>
          {#if canDelete(p)}
            <button
              type="button" title="Remove pin" disabled={busy === 'del-' + p.id} onclick={() => deletePin(p.id)}
              class="shrink-0 rounded-full px-2 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200 disabled:opacity-50"
            >Remove</button>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="mt-3 font-body text-[13px] font-bold text-cocoa-500">No pins yet — search a place or drop a pin to mark the campsite, meetup point, parking, trailheads…</p>
  {/if}
</Card>

<style>
  /* Leaflet renders markers outside this component's scope, so the bubble style
     must be global. A round white bubble with the category emoji. */
  :global(.pin-bubble) {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    font-size: 16px;
    line-height: 1;
    background: var(--color-surface-card, #fff);
    border: 2px solid var(--color-sand-300, #ffe0c2);
    border-radius: 9999px;
    box-shadow: 0 2px 6px rgba(43, 30, 28, 0.25);
  }
  :global(.pin-bubble.is-selected) {
    border-color: var(--color-coral-500, #ff6b4a);
    background: var(--color-coral-100, #ffe6df);
  }
  :global(.pin-bubble.is-draft) {
    border-color: var(--color-coral-500, #ff6b4a);
    border-style: dashed;
  }
</style>
