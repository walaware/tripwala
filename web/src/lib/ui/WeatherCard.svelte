<script>
  // Trip-dates weather forecast, fetched client-side from Open-Meteo (free, no
  // key, CORS-enabled — so no server load, no SSRF surface, no schema). We only
  // fetch when the trip has a location and starts inside the ~16-day forecast
  // horizon; otherwise the card renders nothing. All failures are silent.
  import { fmtWeekday, fmtMonthDay } from '$lib/format.js';
  import { page } from '$app/state';
  import { tempUnit, openMeteoUnit } from '$lib/prefs.js';

  /** @type {{ location?: string, startDate?: string, endDate?: string }} */
  let { location = '', startDate = '', endDate = '' } = $props();

  // The viewer's temperature-unit preference (F/C). Anonymous share-link viewers
  // have no user → falls back to F.
  const unit = $derived(tempUnit(page.data?.user));

  // How many placeholder pills the loading skeleton shows — the trip's own day
  // span (inclusive), clamped, so the skeleton matches the forecast it precedes.
  const skeletonCount = $derived.by(() => {
    const s = new Date(startDate || '');
    const e = new Date(endDate || startDate || '');
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 3;
    const days =
      Math.round(
        (Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()) -
          Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())) /
          86400000
      ) + 1;
    return Math.min(Math.max(days, 1), 8);
  });

  /** @type {'idle'|'loading'|'ready'} */
  let phase = $state('idle');
  /** @type {Array<{ date: string, code: number, tmax: number, tmin: number }>} */
  let days = $state([]);
  let place = $state('');

  // The last input signature we fetched for. The trip page short-polls (~4s), so
  // this $effect re-runs constantly with unchanged inputs; without this guard it
  // would refetch and flash the card (idle → loading → ready) every few seconds.
  // Plain variables (not $state) so reading/writing them here creates no
  // dependency. `reqId` supersedes in-flight fetches when inputs actually change.
  let lastKey = '';
  let reqId = 0;

  // WMO weather code → [emoji, label]. Grouped to the buckets that matter.
  /** @type {Record<number, [string, string]>} */
  const WMO = {
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
    51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Drizzle'],
    56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
    61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
    71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
    80: ['🌦️', 'Showers'], 81: ['🌦️', 'Showers'], 82: ['⛈️', 'Violent showers'],
    85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Snow showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm']
  };
  const wmo = (/** @type {number} */ c) => WMO[c] ?? ['🌡️', ''];

  /** True if `start` is within the forecast horizon (and not long past). */
  function inWindow(/** @type {string} */ start) {
    if (!start) return false;
    const s = new Date(start);
    if (Number.isNaN(s.getTime())) return false;
    const now = new Date();
    const delta =
      (Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) -
        Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000;
    return delta >= -1 && delta <= 15;
  }

  $effect(() => {
    const loc = (location || '').trim();
    const start = startDate || '';
    const end = endDate || start;
    const u = unit;
    // Skip when nothing that affects the forecast changed — keeps the already-
    // rendered card in place through the trip page's short-poll re-renders.
    const key = `${loc}|${start}|${end}|${u}`;
    if (key === lastKey) return;
    lastKey = key;
    // Each real fetch gets a monotonic id; async results only apply if theirs is
    // still the latest (a newer inputs-change supersedes an in-flight one). We
    // deliberately don't cancel via effect-cleanup: cleanup runs before *every*
    // re-run, including the poll re-runs that early-return above, which would
    // abort a still-in-flight first fetch and leave the card blank forever.
    const myId = ++reqId;
    if (!loc || !inWindow(start)) {
      phase = 'idle';
      return;
    }
    phase = 'loading';
    // Open-Meteo's gazetteer matches place names, not "Place, ST" strings — so
    // try the full location, then fall back to the part before the first comma
    // ("Yosemite Valley, CA" → "Yosemite Valley").
    /** @param {string} name */
    const geocode = async (name) => {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(name)}`
      ).then((r) => r.json());
      return res?.results?.[0] ?? null;
    };
    (async () => {
      try {
        const head = loc.split(',')[0].trim();
        const hit = (await geocode(loc)) || (head && head !== loc ? await geocode(head) : null);
        if (myId !== reqId) return;
        if (!hit) {
          phase = 'idle';
          return;
        }
        const sd = start.slice(0, 10);
        const ed = (end || start).slice(0, 10);
        const fc = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=${openMeteoUnit(u)}` +
            `&timezone=auto&start_date=${sd}&end_date=${ed}`
        ).then((r) => r.json());
        const t = fc?.daily?.time ?? [];
        const rows = t.map((/** @type {string} */ date, /** @type {number} */ i) => ({
          date,
          code: fc.daily.weather_code[i],
          tmax: Math.round(fc.daily.temperature_2m_max[i]),
          tmin: Math.round(fc.daily.temperature_2m_min[i])
        }));
        if (myId !== reqId) return;
        days = rows;
        place = [hit.name, hit.admin1, hit.country_code].filter(Boolean).slice(0, 2).join(', ');
        phase = rows.length ? 'ready' : 'idle';
      } catch (_) {
        if (myId === reqId) phase = 'idle';
      }
    })();
  });
</script>

{#if phase === 'loading'}
  <!-- Loading skeleton: mirrors the ready layout (label + a strip of pills) with
       a soft pulse, so the card holds its space instead of popping in. -->
  <div class="mt-4 rounded-2xl p-3" style="background: var(--color-sand-100)" aria-hidden="true">
    <div class="mb-2 flex items-center gap-1.5">
      <span class="font-body text-[12px] font-extrabold text-cocoa-500">🌤️ Forecast</span>
      <span class="h-2.5 w-20 animate-pulse rounded-full bg-sand-300"></span>
    </div>
    <div class="-mx-1 flex justify-center-safe gap-2 overflow-hidden px-1">
      {#each Array.from({ length: skeletonCount }) as _, i (i)}
        <div class="flex w-[68px] flex-none animate-pulse flex-col items-center gap-1.5 rounded-xl bg-white px-1 py-2">
          <span class="h-2.5 w-8 rounded bg-sand-300"></span>
          <span class="my-0.5 h-6 w-6 rounded-full bg-sand-300"></span>
          <span class="h-3 w-6 rounded bg-sand-300"></span>
          <span class="h-2.5 w-5 rounded bg-sand-300"></span>
        </div>
      {/each}
    </div>
  </div>
{:else if phase === 'ready'}
  <div class="mt-4 rounded-2xl bg-sky-100 p-3" style="background: var(--color-sand-100)">
    <div class="mb-2 flex items-center gap-1.5">
      <span class="font-body text-[12px] font-extrabold text-cocoa-500">🌤️ Forecast{#if place} · {place}{/if}</span>
    </div>
    <div class="-mx-1 flex justify-center-safe gap-2 overflow-x-auto px-1 [scrollbar-width:thin]">
      {#each days as d (d.date)}
        {@const w = wmo(d.code)}
        <div class="flex w-[68px] flex-none flex-col items-center rounded-xl bg-white px-1 py-2 text-center">
          <span class="font-body text-[11px] font-extrabold text-cocoa-500">{fmtWeekday(d.date).slice(0, 3)}</span>
          <span class="my-0.5 text-2xl" title={w[1]}>{w[0]}</span>
          <span class="font-display text-[13px] font-bold text-cocoa-900">{d.tmax}°</span>
          <span class="font-body text-[11px] font-bold text-cocoa-400">{d.tmin}°</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
