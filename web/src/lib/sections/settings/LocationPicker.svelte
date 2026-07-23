<script>
  // Trip "Where" as a confirmed place, not a loose free-text string. Typing a
  // name and picking a result from the server-proxied Nominatim geocoder (the
  // same one the Map section uses) captures exact lat/lng — which weather + map
  // then read directly instead of re-geocoding the name and guessing wrong (the
  // "Big Pines → Florida" bug). Free text still works: if you just type and never
  // pick, we keep the text and clear the coordinates (weather falls back to the
  // legacy name-geocode path). Picked coords are shown as a confirmation chip.
  import { inputClass, labelClass } from './styles.js';
  import { hasCoords } from '$lib/coords.js';

  /**
   * @type {{
   *   shareToken: string,
   *   value: string,
   *   lat: number,
   *   lng: number,
   *   placeName: string,
   *   onPick: (p: { label: string, lat: number, lng: number, placeName: string }) => void,
   *   onText: (text: string) => void
   * }}
   */
  let { shareToken, value = '', lat = 0, lng = 0, placeName = '', onPick, onText } = $props();

  let q = $state('');
  let searching = $state(false);
  let searchError = $state('');
  /** @type {Array<{ label: string, lat: number, lng: number }>} */
  let results = $state([]);

  const pinned = $derived(hasCoords(lat, lng));

  async function runSearch() {
    const query = q.trim();
    if (query.length < 2 || searching) return;
    searching = true;
    searchError = '';
    try {
      const res = await fetch(`/${encodeURIComponent(shareToken)}/geocode?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(String(res.status));
      results = (await res.json()).results ?? [];
      if (!results.length) searchError = 'No places found — try a broader name.';
    } catch (_) {
      searchError = 'Search is unavailable — try again.';
      results = [];
    } finally {
      searching = false;
    }
  }

  /** @param {{ label: string, lat: number, lng: number }} r */
  function pick(r) {
    // Short, human label for the trip's "Where" (leading name before the first
    // comma); keep the full display string as the confirmed place_name.
    const label = r.label.split(',')[0].slice(0, 120);
    onPick({ label, lat: r.lat, lng: r.lng, placeName: r.label.slice(0, 300) });
    results = [];
    q = '';
    searchError = '';
  }

  /** Editing the free text by hand drops the pinned coords (they no longer match). */
  function onInput(/** @type {Event} */ e) {
    onText(/** @type {HTMLInputElement} */ (e.target).value);
  }
</script>

<div>
  <label class={labelClass} for="ts-loc">Where</label>
  <input
    id="ts-loc"
    value={value}
    oninput={onInput}
    maxlength="300"
    placeholder="e.g. Big Pines, Angeles National Forest"
    class={inputClass}
  />

  {#if pinned}
    <p class="mt-1 flex items-center gap-1.5 font-body text-[12px] font-bold text-leaf-600">
      <span>📍 Pinned{#if placeName} · {placeName}{/if}</span>
    </p>
  {:else}
    <p class="mt-1 font-body text-[12px] font-bold text-cocoa-400">
      Search below and pick the exact spot so weather &amp; the map land on the right place.
    </p>
  {/if}

  <!-- Confirm the exact place (server-proxied Nominatim, members-only). -->
  <div class="mt-2 flex gap-2">
    <input
      bind:value={q}
      placeholder="Search a place to pin…"
      class="{inputClass} flex-1"
      onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), runSearch())}
    />
    <button
      type="button"
      onclick={runSearch}
      disabled={q.trim().length < 2 || searching}
      class="shrink-0 rounded-md border-2 border-sand-300 bg-sand-100 px-3 font-body text-[13px] font-extrabold text-cocoa-700 hover:bg-sand-200 disabled:opacity-50"
    >{searching ? '…' : 'Search'}</button>
  </div>
  {#if searchError}
    <p class="mt-1 font-body text-[12px] font-bold text-cocoa-500">{searchError}</p>
  {/if}
  {#if results.length}
    <div class="mt-1.5 flex flex-col overflow-hidden rounded-xl border-2 border-sand-200">
      {#each results as r, i (r.label + i)}
        <button
          type="button"
          onclick={() => pick(r)}
          class="px-3 py-2 text-left font-body text-[13px] font-bold text-cocoa-800 hover:bg-sand-100 {i !== 0 ? 'border-t border-sand-200' : ''}"
        >{r.label}</button>
      {/each}
    </div>
  {/if}
</div>
