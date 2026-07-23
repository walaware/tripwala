<script>
  // The trip's route surface, shown under the map: import a GPX/GPS track (from
  // AllTrails Plus, Gaia, CalTopo, Strava, Wikiloc, …) and/or link the trail
  // page. An imported track renders as a map polyline (drawn by the parent
  // MapSection) with an elevation profile + distance/gain stats here; a link
  // shows an unfurled preview card. GPX is parsed in the browser ($lib/gpx.js);
  // only the sanitized geometry is sent up, and the server re-derives all stats.
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { Button } from '@walaware/design';
  import { tripAction } from '$lib/tripClient.js';
  import { tempUnit, unitSystem } from '$lib/prefs.js';
  import { parseGpx, decimate, toCoordinates, fromCoordinates, elevationProfile } from '$lib/gpx.js';
  import ElevationProfile from '$lib/ui/ElevationProfile.svelte';

  /**
   * @type {{
   *   shareToken: string,
   *   route: { name?: string, url?: string, preview?: any, coordinates?: number[][], stats?: any } | null,
   *   onHoverPoint?: (p: { lat: number, lng: number } | null) => void
   * }}
   */
  let { shareToken, route = null, onHoverPoint = () => {} } = $props();

  const sys = $derived(unitSystem(tempUnit(page.data?.user)));

  let busy = $state('');
  let error = $state('');
  let showLink = $state(false);
  let url = $state('');
  /** @type {HTMLInputElement | undefined} */
  let fileInput;

  const hasTrack = $derived(!!(route?.coordinates && route.coordinates.length > 1));
  const points = $derived(hasTrack ? fromCoordinates(route?.coordinates) : []);
  const profile = $derived(hasTrack ? elevationProfile(points, 140) : []);
  const stats = $derived(route?.stats ?? null);

  /** @param {number | null} index into the full track */
  function hoverAt(index) {
    if (index == null || !points[index]) return onHoverPoint(null);
    onHoverPoint({ lat: points[index].lat, lng: points[index].lng });
  }

  /** @param {Event} e */
  async function onFile(e) {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (!file || busy) return;
    error = '';
    if (file.size > 12 * 1024 * 1024) {
      error = 'That file is over 12 MB — is it really a GPX track?';
      return;
    }
    busy = 'import';
    try {
      const text = await file.text();
      const parsed = parseGpx(text);
      if (!parsed) {
        error = "Couldn't find a track in that file. Export it as GPX and try again.";
        return;
      }
      const coordinates = toCoordinates(decimate(parsed.points));
      await tripAction(shareToken, { op: 'route_set', name: parsed.name, coordinates });
      await invalidateAll();
    } catch (_) {
      error = 'That import failed — try a different GPX file.';
    } finally {
      busy = '';
      if (fileInput) fileInput.value = ''; // allow re-importing the same file
    }
  }

  async function linkTrail() {
    const u = url.trim();
    if (!/^https?:\/\/.+/i.test(u) || busy) {
      error = 'Enter a full https:// trail link.';
      return;
    }
    busy = 'link';
    error = '';
    try {
      await tripAction(shareToken, { op: 'route_link', url: u });
      url = '';
      showLink = false;
      await invalidateAll();
    } catch (_) {
      error = "Couldn't save that link — try again.";
    } finally {
      busy = '';
    }
  }

  async function clearRoute() {
    if (busy) return;
    busy = 'clear';
    try {
      await tripAction(shareToken, { op: 'route_clear' });
      onHoverPoint(null);
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  const fmtDist = (/** @type {number} */ m) =>
    sys.metric ? `${(m / 1000).toFixed(1)} km` : `${(m / 1609.344).toFixed(1)} mi`;
  const fmtEle = (/** @type {number} */ m) =>
    m == null ? '–' : sys.metric ? `${Math.round(m)} m` : `${Math.round(m * 3.28084)} ft`;

  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-2.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
</script>

<div class="mt-3 rounded-2xl bg-sand-100 p-3">
  <div class="flex items-center justify-between gap-2">
    <span class="font-body text-[13px] font-extrabold text-cocoa-700">🥾 Route{#if route?.name} · {route.name}{/if}</span>
    {#if hasTrack || route?.url}
      <button
        type="button" onclick={clearRoute} disabled={busy === 'clear'}
        class="rounded-full px-2 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-100 disabled:opacity-50"
      >Remove</button>
    {/if}
  </div>

  {#if hasTrack && stats}
    <!-- Track stats -->
    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-body text-[13px] font-bold text-cocoa-700">
      <span>📏 {fmtDist(stats.distanceM)}</span>
      {#if stats.hasEle}
        <span>↗ {fmtEle(stats.gainM)}</span>
        <span>↘ {fmtEle(stats.lossM)}</span>
        <span class="text-cocoa-400">{fmtEle(stats.minEle)}–{fmtEle(stats.maxEle)}</span>
      {/if}
    </div>
    {#if profile.length > 1}
      <ElevationProfile {profile} metric={sys.metric} onHover={hoverAt} />
    {/if}
  {/if}

  {#if route?.url}
    <a
      href={route.url} target="_blank" rel="noopener noreferrer"
      class="mt-2 flex items-center gap-2.5 rounded-xl bg-white p-2 hover:bg-sand-50"
    >
      {#if route.preview?.image}
        <img src={route.preview.image} alt="" class="h-11 w-11 flex-none rounded-lg object-cover" loading="lazy" />
      {:else}
        <span class="grid h-11 w-11 flex-none place-items-center rounded-lg bg-sand-100 text-lg">🔗</span>
      {/if}
      <span class="min-w-0">
        <span class="block truncate font-body text-[13px] font-extrabold text-cocoa-900">{route.preview?.title || route.url}</span>
        <span class="block truncate font-body text-[12px] font-bold text-cocoa-400">View the trail ↗</span>
      </span>
    </a>
  {/if}

  <!-- Controls -->
  <div class="mt-2.5 flex flex-wrap gap-2">
    <Button variant="soft" size="sm" onclick={() => fileInput?.click()} disabled={busy === 'import'}>
      {busy === 'import' ? 'Importing…' : hasTrack ? 'Replace GPX' : '＋ Import GPX'}
    </Button>
    {#if !route?.url}
      <Button variant="ghost" size="sm" onclick={() => (showLink = !showLink)}>
        {showLink ? 'Cancel' : 'Link a trail'}
      </Button>
    {/if}
    <input bind:this={fileInput} type="file" accept=".gpx,application/gpx+xml,text/xml" class="hidden" onchange={onFile} />
  </div>

  {#if showLink}
    <div class="mt-2 flex gap-2">
      <input
        bind:value={url} placeholder="Paste an AllTrails / Gaia / CalTopo link…"
        class="{inputClass} flex-1" inputmode="url"
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), linkTrail())}
      />
      <Button variant="primary" size="sm" onclick={linkTrail} disabled={busy === 'link'}>
        {busy === 'link' ? 'Saving…' : 'Link'}
      </Button>
    </div>
  {/if}

  {#if error}<p class="mt-1.5 font-body text-[12px] font-bold text-berry-600">{error}</p>{/if}
  {#if !hasTrack && !route?.url}
    <p class="mt-1.5 font-body text-[12px] font-bold text-cocoa-400">
      Import a GPX to draw the trail with an elevation profile, or link the trail page. AllTrails GPX export needs their Plus tier; Gaia, CalTopo, Strava &amp; Wikiloc export free.
    </p>
  {/if}
</div>
