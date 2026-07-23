<script>
  // The backpacking planner's hero: a Windy-style hourly scrobbler + a daily
  // backcountry briefing (sunrise/sunset, daylight, freeze/wind/storm warnings)
  // for the trip's pinned point. Fetched client-side from Open-Meteo (free, no
  // key, CORS) — no server load, no schema. Shown only for backpacking trips
  // with a pinned location and dates inside the ~16-day forecast horizon; all
  // failures are silent (the surface just renders nothing). Pure parsing/warning
  // logic lives in $lib/weather.js (tested); this component owns fetch + render.
  import { Skeleton } from '@walaware/design';
  import { page } from '$app/state';
  import { fmtWeekday } from '$lib/format.js';
  import { tempUnit, openMeteoUnit, unitSystem } from '$lib/prefs.js';
  import { hasCoords } from '$lib/coords.js';
  import { wmo, clampWindow, forecastUrl, parseForecast, fmtDaylight, fmtElevation } from '$lib/weather.js';

  /** @type {{ location?: string, lat?: number, lng?: number, placeName?: string, startDate?: string, endDate?: string }} */
  let { location = '', lat = 0, lng = 0, placeName = '', startDate = '', endDate = '' } = $props();

  const unit = $derived(tempUnit(page.data?.user));
  const sys = $derived(unitSystem(unit));
  const pinned = $derived(hasCoords(lat, lng));

  /** @type {'idle'|'loading'|'ready'} */
  let phase = $state('idle');
  /** @type {ReturnType<typeof parseForecast>} */
  let data = $state({ hours: [], days: [], elevation: null });
  let idx = $state(0); // scrobbler position (index into data.hours)

  // Fetch dedup: the trip page short-polls, so this $effect re-runs constantly
  // with unchanged inputs. lastKey skips those; reqId supersedes in-flight
  // fetches when inputs actually change. Plain vars → reading them adds no dep.
  let lastKey = '';
  let reqId = 0;

  $effect(() => {
    const la = lat;
    const ln = lng;
    const on = pinned;
    const win = clampWindow(startDate || '', endDate || startDate || '');
    const u = unit;
    const key = on && win ? `${la},${ln}|${win.startDate}|${win.endDate}|${u}` : '';
    if (key === lastKey) return;
    lastKey = key;
    const myId = ++reqId;
    if (!on || !win) {
      phase = 'idle';
      return;
    }
    phase = 'loading';
    (async () => {
      try {
        const url = forecastUrl({
          lat: la, lng: ln, startDate: win.startDate, endDate: win.endDate,
          tempQuery: openMeteoUnit(u), windQuery: sys.windQuery, precipQuery: sys.precipQuery
        });
        const json = await fetch(url).then((r) => r.json());
        if (myId !== reqId) return;
        const parsed = parseForecast(json, sys.metric ? 'metric' : 'imperial');
        data = parsed;
        idx = defaultHour(parsed.hours);
        phase = parsed.hours.length ? 'ready' : 'idle';
      } catch (_) {
        if (myId === reqId) phase = 'idle';
      }
    })();
  });

  /** Open the scrobber on a useful hour: local noon of the first day, else 0. */
  function defaultHour(/** @type {Array<{ time: string }>} */ hours) {
    const noon = hours.findIndex((h) => h.time.slice(11, 16) === '12:00');
    return noon >= 0 ? noon : 0;
  }

  const cur = $derived(data.hours[idx] ?? null);
  const round = (/** @type {number|null} */ v) => (Number.isFinite(v) && v != null ? Math.round(v) : '–');

  // Distinct warnings across the whole trip → a compact summary banner.
  const tripWarnings = $derived.by(() => {
    /** @type {Map<string, { kind: string, emoji: string, label: string }>} */
    const m = new Map();
    for (const d of data.days) for (const w of d.warnings) if (!m.has(w.kind)) m.set(w.kind, w);
    return [...m.values()];
  });

  // Precip-probability strip under the slider (the Windy-style "scan the
  // timeline" cue). Height + blue tint by probability; the selected hour is
  // marked. Decorative → aria-hidden (the slider + readout carry the real info).
  const strip = $derived(data.hours.map((/** @type {{ precipProb: number }} */ h) => Math.max(0, Math.min(100, h.precipProb ?? 0))));

  /** Human day+time for the current scrobber hour, e.g. "Thu · 2 PM". */
  const curWhen = $derived.by(() => {
    if (!cur) return '';
    const hh = Number(cur.time.slice(11, 13));
    const ampm = hh < 12 ? 'AM' : 'PM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${fmtWeekday(cur.time.slice(0, 10)).slice(0, 3)} · ${h12} ${ampm}`;
  });

  const curW = $derived(cur ? wmo(cur.code) : ['', '']);
  const feelsGap = $derived(cur && Number.isFinite(cur.temp) && Number.isFinite(cur.apparent) ? Math.abs(cur.temp - cur.apparent) : 0);
  const place = $derived((placeName || location || '').split(',').slice(0, 2).join(',').slice(0, 60));
</script>

{#if phase === 'loading'}
  <div class="mt-4 rounded-2xl p-3.5" style="background: var(--color-sand-100)" aria-busy="true">
    <div class="mb-2 flex items-center gap-1.5">
      <span class="font-body text-[12px] font-extrabold text-cocoa-500">🎒 Backcountry forecast</span>
      <Skeleton variant="text" width={90} height={10} />
    </div>
    <Skeleton variant="rect" height={72} class="rounded-xl" />
    <div class="mt-2 flex gap-2 overflow-hidden">
      {#each Array.from({ length: 5 }) as _, i (i)}<Skeleton variant="rect" width={92} height={96} class="flex-none rounded-xl" />{/each}
    </div>
  </div>
{:else if phase === 'ready'}
  <div class="mt-4 rounded-2xl p-3.5" style="background: var(--color-sand-100)">
    <div class="mb-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span class="font-body text-[12px] font-extrabold text-cocoa-500">🎒 Backcountry forecast{#if place} · {place}{/if}</span>
      {#if data.elevation != null}
        <span class="rounded-full bg-white px-2 py-0.5 font-body text-[11px] font-bold text-cocoa-500">⛰️ {fmtElevation(data.elevation, sys.metric)} {sys.elevLabel}</span>
      {/if}
    </div>

    {#if tripWarnings.length}
      <div class="mb-2.5 flex flex-wrap gap-1.5">
        {#each tripWarnings as w (w.kind)}
          <span class="flex items-center gap-1 rounded-full bg-berry-100 px-2 py-1 font-body text-[11.5px] font-extrabold text-berry-700">
            <span>{w.emoji}</span>{w.label}
          </span>
        {/each}
      </div>
    {/if}

    <!-- Hourly scrobbler -->
    {#if cur}
      <div class="rounded-xl bg-white p-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-400">{curWhen}</div>
            <div class="mt-0.5 flex items-baseline gap-2">
              <span class="text-3xl leading-none" title={curW[1]}>{curW[0]}</span>
              <span class="font-display text-[26px] font-bold text-cocoa-900">{round(cur.temp)}°</span>
              {#if feelsGap >= 3}<span class="font-body text-[12px] font-bold text-cocoa-400">feels {round(cur.apparent)}°</span>{/if}
            </div>
            <div class="mt-0.5 font-body text-[12.5px] font-bold text-cocoa-500">{curW[1]}</div>
          </div>
          <div class="flex flex-none flex-col gap-1 text-right font-body text-[12.5px] font-bold text-cocoa-600">
            <span title="Wind / gusts">💨 {round(cur.wind)}<span class="text-cocoa-400"> / {round(cur.gust)} {sys.windLabel}</span></span>
            <span title="Precipitation chance">🌧️ {round(cur.precipProb)}%<span class="text-cocoa-400">{cur.precip > 0 ? ` · ${cur.precip}${sys.precipLabel}` : ''}</span></span>
            <span title="Cloud cover">☁️ {round(cur.cloud)}%</span>
          </div>
        </div>

        <!-- Precip-probability strip: a quick scan of when it might rain. -->
        <div class="mt-2.5 flex h-8 items-end gap-px" aria-hidden="true">
          {#each strip as p, i (i)}
            <div
              class="flex-1 rounded-t-sm transition-[height]"
              style="height: {Math.max(6, p)}%; background: {i === idx ? 'var(--color-coral-500)' : `color-mix(in srgb, var(--color-sky-500, #3aa0ff) ${20 + p * 0.7}%, var(--color-sand-200))`}"
            ></div>
          {/each}
        </div>
        <input
          type="range" min="0" max={data.hours.length - 1} step="1" bind:value={idx}
          aria-label="Scrub the hourly forecast"
          class="mt-1 w-full accent-coral-500"
        />
      </div>
    {/if}

    <!-- Daily briefing -->
    {#if data.days.length}
      <div class="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 [scrollbar-width:thin]">
        {#each data.days as d (d.date)}
          {@const w = wmo(d.code)}
          <div class="flex w-[112px] flex-none flex-col gap-1 rounded-xl bg-white px-2.5 py-2.5">
            <div class="flex items-center justify-between">
              <span class="font-body text-[12px] font-extrabold text-cocoa-500">{fmtWeekday(d.date).slice(0, 3)}</span>
              <span class="text-xl" title={w[1]}>{w[0]}</span>
            </div>
            <div class="font-display text-[14px] font-bold text-cocoa-900">{round(d.tmax)}° <span class="font-body text-[12px] font-bold text-cocoa-400">/ {round(d.tmin)}°</span></div>
            <div class="font-body text-[11px] font-bold text-cocoa-400">
              ☀ {(d.sunrise || '').slice(11, 16)} · 🌙 {(d.sunset || '').slice(11, 16)}
            </div>
            {#if d.daylightMins != null}<div class="font-body text-[11px] font-bold text-cocoa-400">{fmtDaylight(d.daylightMins)} light</div>{/if}
            {#if d.warnings.length}
              <div class="mt-0.5 flex flex-wrap gap-1">
                {#each d.warnings as wn (wn.kind)}<span title={wn.label} class="text-[13px]">{wn.emoji}</span>{/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
