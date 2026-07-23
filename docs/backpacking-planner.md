# tripwala Backpacking Planner — Design & Roadmap

> Status: **Phase 1 shipped** (accurate location + weather); Phases 2–6 are
> **design**. The north star is an "AllTrails × Windy" surface for `trip_type:
> backpacking` trips — accurate backcountry weather you can scrobble through
> time, an elevation/route profile, and the safety layers a backcountry trip
> actually needs. Built on the existing Leaflet map + Open-Meteo stack, adding a
> keyed API only where free sources genuinely cap out.

## Principles

1. **Trip-type aware, not a separate app.** The planner is an enriched surface
   that appears for backpacking (and, where sensible, camping/ski) trips. It
   reuses the trip's crew, dates, map pins, and gear — it doesn't fork them.
2. **Free-first, pay only where free caps out.** Everything critical ships on
   OSM + Open-Meteo (no key). Two paid upgrades are worth it *later*: a topo
   basemap and Windy-style animated weather layers (see §API landscape).
3. **Safety is a feature.** Daylight/turnaround times, freeze/storm warnings,
   NWS alerts, and (winter) avalanche danger are first-class, not decoration.
4. **Self-host-friendly.** Prefer sources an operator can run themselves
   (Overpass, Valhalla, OpenTopoData) so the app degrades gracefully with no
   keys — same posture as `docs/ai-features.md`.
5. **Graceful degradation.** No coordinates → no planner, just the normal trip.
   No key → the free layer. A failed fetch is silent; the trip still works.

---

## Phase 1 — Accurate location & weather ✅ (shipped)

The bug that started this: a trip's "Where" was **free text only**, and the
weather + map surfaces re-geocoded that string at read time with Open-Meteo's
`count=1` gazetteer — so "Big Pines" silently resolved to whichever match ranked
first (a Florida one, not the Angeles-NF backcountry spot).

**Fix — persist a confirmed point:**

- `trips` gains `lat`, `lng`, `place_name`, `elevation`
  (migration `1718605000_trip_coordinates.js`). `0,0` = "unset" (see
  `$lib/coords.js` `hasCoords` — Null Island is open ocean, so it's a safe
  sentinel).
- The Trip-details "Where" field is now a **`LocationPicker`** that searches the
  existing server-proxied Nominatim geocoder (members-only, rate-limited) and
  lets the organizer **pin the exact place**, capturing lat/lng + a resolved
  label. Hand-editing the text drops the pin (the words no longer match coords).
- `WeatherCard` and `MapSection` **read the pinned coordinates directly** —
  no geocoding, no guessing. Legacy trips with no pin fall back to the old
  name-geocode path, so nothing regresses.

**Follow-ups still open in Phase 1's spirit:**

- Backfill: one-time job to pin existing trips whose `location` geocodes
  unambiguously; leave ambiguous ones for the organizer to confirm.
- Surface a subtle "is this the right spot?" nudge on trips that still rely on
  the name-geocode fallback.

---

## Phase 2 — Backpacking overview surface (core) 🚧 (first cut built)

Turns the pinned point + dates into a backcountry briefing. **All free
(Open-Meteo), no key.** First cut lives in the **Overview** (where weather
already is), gated on `trip_type === 'backpacking'` + a pinned location; the
compact `WeatherCard` still serves every other trip and the unpinned fallback.

**Built (`web/src/lib/ui/BackpackingForecast.svelte`, logic in
`web/src/lib/weather.js`, tested):**

- **Hourly weather scrobbler (Windy-style).** ✅ Open-Meteo hourly for the trip
  window: temperature + *apparent* temp, precip probability + amount, wind
  speed/gust, cloud cover. A draggable slider scrubs the timeline with a compact
  readout; a precip-probability strip gives the "scan the timeline" cue.
- **Elevation.** ✅ Shown in the header from the forecast response's grid-cell
  elevation (imperial→ft / metric→m). *(Persisting to `trips.elevation` deferred.)*
- **Daylight & turnaround.** ✅ Sunrise/sunset + day length per day (from
  Open-Meteo daily; no extra provider needed). *(Explicit turnaround-time hint
  deferred.)*
- **Backcountry warnings.** ✅ Derived, honest flags: below-freezing / hard-freeze
  lows, high wind (gusts), heavy rain/snow, thunderstorms — as a trip-level
  summary banner + per-day chips. Unit-aware thresholds.
- **Units.** ✅ One "unit system" derived from the temp pref (`$lib/prefs.js`
  `unitSystem`): °F→mph/in/ft, °C→km/h/mm/m.

**Deferred to a Phase 2 follow-up:**

- **NWS alerts (US).** weather.gov point alerts (free, no key, US-only) — a
  dismissible red-flag/winter-storm/flood banner.
- **Map-marker sync.** Scrobbling moves the marker on the trip map.
- **Dedicated rail section.** Promote from an Overview panel to a first-class
  `BackpackingSection` in the rail/hub/nav (needs the section-registry wiring in
  `tripSections.js` + `TripView.svelte`).
- **Server `weatherService`.** Cache by coord+day + respect provider rate limits
  (service-core pattern, `docs/api-layer.md`) once the client short-poll makes
  direct fetches wasteful. Also persist `trips.elevation` lazily.

---

## Phase 3 — Route & elevation profile (the "AllTrails" core) 🚧 (first cut built)

Give the trip an actual **route**, not just a point. Lives under the Map section
(one Leaflet map for pins + route); a trip carries one `route` (json field on
`trips`, migration `1718605300`). **Why import-a-GPX + link, not auto-lookup:**
AllTrails has no API and its GPX export is Plus-gated, and OSM/Overpass hiking
relations miss most AllTrails-style day-hikes (they aren't route relations) — so
a "type a trail name" lookup would disappoint. GPX import works with every
source; a pasted trail link covers the reference.

**Built:**

- **GPX/GPS import.** ✅ `web/src/lib/gpx.js` — a dependency-free, isomorphic,
  regex-based GPX parser (handles `<trkpt>`/`<rtept>`, self-closing or with
  `<ele>`; AllTrails-Plus/Gaia/CalTopo/Strava/Wikiloc exports). Parsed in the
  browser (`RoutePanel`); decimated to ≤2000 pts; sent as GeoJSON `[lng,lat,ele]`.
  **The server re-derives all stats** from the sanitized geometry (`route_set`),
  so client numbers are never trusted. 13 tests.
- **Elevation profile chart.** ✅ `ElevationProfile.svelte` — a hand-rolled SVG
  area chart (no chart lib) of elevation vs cumulative distance, with distance /
  gain / loss / min–max stats. Elevation comes from the GPX's own `<ele>`;
  gain/loss use a smoothed series so GPS jitter doesn't overcount.
- **Hover-linked map ↔ profile.** ✅ Scrubbing the profile moves a marker along
  the route polyline on the map. (map→profile direction deferred.)
- **Trail link.** ✅ Paste an AllTrails/Gaia/CalTopo/… URL (`route_link`) →
  best-effort SSRF-guarded unfurl → a preview card + link-out; coexists with an
  imported track.

**Deferred to a Phase 3 follow-up:**

- **KML/TCX import** (only GPX in the first cut).
- **Elevation backfill** for GPX files with no `<ele>`: sample OpenTopoData
  (self-host or 1k/day public) along the track.
- **Trailheads & waymarked routes (OSM).** Overpass `route=hiking` relations +
  trail POIs near the pin as suggested pins / "connect to a known trail" — the
  only *legal* third-party trail-geometry source (see §API landscape). Needs a
  rate-limited proxy like the geocode one.
- **Multi-day segmentation** — split the track into daily legs feeding Phase 5.

---

## Phase 4 — Backcountry map layers

- **Topo basemap toggle.** Add a topo/terrain layer next to the current OSM
  raster. Free start: **Thunderforest Outdoors** (150k tiles/mo free) and
  **USGS Topo** (US, public domain). This is the single biggest *visual* jump
  toward AllTrails quality.
- **Avalanche danger overlay (winter, US).** Avalanche.org's free public GeoJSON
  API → a danger-by-forecast-center layer for ski/winter backpacking trips.
- **Water sources / campsites.** Overpass query for `amenity=drinking_water`,
  springs, and designated campsites near the route — rendered as optional pins.

---

## Phase 5 — Planning intelligence & gear

- **Condition-aware packing.** Cross the weather warnings with the existing
  gear/"what to bring" surface: freezing lows → nudge insulation/bag rating;
  heavy rain → shell + pack cover; high UV/exposure → sun protection.
- **Permits & regulations.** A structured field for permit info / quota links /
  bear-canister rules (manual entry first; automate per-park later).
- **Daily plan from the route.** Suggest day splits from distance + elevation
  gain and daylight (turnaround times), feeding the existing itinerary.

---

## Phase 6 — "Plus"-tier polish (later / paid)

The AllTrails-Plus-flavored extras, gated behind real demand (and, where noted,
a paid API):

- **Offline maps.** Downloadable vector tiles for the route corridor
  (**MapTiler** sells the vector data for on-prem/offline — a genuine
  backcountry feature). Paid.
- **Windy-grade animated weather layers.** The animated wind/precip *map* overlay
  (the defining "Windy feel") via the **Windy Map Forecast API**. Paid — Windy's
  free *point* tier returns deliberately obfuscated data, so this is the one
  category where free genuinely caps out.
- **Live tracking / "I'm safe" check-ins**, trip-report + photo recap wired into
  the existing Wrapped surface, community route sharing.

---

## API landscape (researched 2026-07 — verify pricing before committing)

**AllTrails has no public API** — its catalog/difficulty/reviews can't be
licensed. Any "AllTrails-like" trail layer must be rebuilt from OSM + one of the
sources below. The recommended stack is free/self-hostable with **two optional
paid upgrades** (topo tiles, Windy layers).

### Trail geometry & metadata
Only two sources legally expose geometry to an indie app:
- **OSM `route=hiking` via Overpass** — full geometry, `sac_scale` (difficulty),
  `surface`. Free, ODbL (attribute + share-alike). Self-host Overpass/PBF for
  volume. **← primary.**
- **Waymarked Trails** (hiking.waymarkedtrails.org) — renders OSM hiking routes,
  per-route pages, **GPX/KML export**, open API, **fully self-hostable**. Free.
- Avoid: **Komoot/Wikiloc** (partner/scrape-only — ToS), **Trailforks**
  (share-alike license forbids monetizing; approval rarely granted),
  **Outdooractive** (enterprise contract), **onX** (no API).

### Routing & elevation profiles
- **OpenRouteService** — hiking routing **+ elevation-along-route** in one call;
  real self-serve free tier (~2k directions/day), self-hostable; paid from
  ~€20/mo. **← recommended for live route-planning.**
- **Valhalla (self-hosted)** — most resource-efficient self-host for foot
  routing + elevation once you outgrow ORS; infra cost only.
- **OpenTopoData (self-host / 1k-per-day public)** — elevation sampling for
  imported GPX without burning weather-API quota. **← recommended for profiles.**
- **Open-Meteo Elevation** — free point elevation (Phase 2 already uses it);
  non-commercial. Google Elevation / Mapbox Terrain are keyed alternatives.

### Backcountry map tiles
- **Thunderforest Outdoors** — hiking topo w/ trails + contours; **150k
  tiles/mo free**, then Solo $125/mo. Closest off-the-shelf to the AllTrails
  look. **← start here (free).**
- **MapTiler Outdoor/Topo** — 100k loads/mo free; cheaper scaling than
  Thunderforest and **sells vector data for offline/self-host**. **← the paid
  upgrade worth buying** (unlocks Phase 6 offline maps).
- **USGS Topo** — free, public domain, US-only. Good free layer toggle.
- **Stadia Maps** (Stamen Terrain) — free non-commercial tier, low-cost paid.
- Avoid depending on **OpenTopoMap** (no SLA, dormant since ~2024) — optional
  extra layer only.

### Weather (Windy quality)
- **Open-Meteo** — base hourly engine (already in use); free, non-commercial,
  generous, no key.
- **NWS / weather.gov** — **free, no key**, US-only official point forecasts **+
  alerts**. **← add for US safety alerts.**
- **Avalanche.org public API** — free GeoJSON danger layer (US). **← add for
  winter.**
- **sunrise-sunset.org** — free daylight/twilight times.
- **Windy Point Forecast** — free tier returns obfuscated data (dev-only); real
  data is **Professional €990/yr**. **Windy Map Forecast** = the animated map
  layers (paid). **← Phase 6 only, on demand.**
- **OpenWeather One Call** (1k/day free) — cheapest *global* alerts add-on if we
  ever need non-US coverage NWS can't give.

### GPX handling (all free OSS)
`@tmcw/togeojson` (parse) → `simplify-js` (decimate) → `leaflet-gpx` (render +
distance/time/elevation stats) → a box-average smoothing pass before summing
elevation gain. `gpxjs` is an alternative with built-in distance/elevation/slope
if we want stats in our own data model rather than tied to the map.

### The two paid upgrades most worth buying (when traffic justifies it)
1. **MapTiler** (or Thunderforest Outdoors) — topo/contour basemap; MapTiler
   additionally unlocks offline vector maps. Biggest visual jump; free tier to
   start.
2. **Windy Map Forecast API** — animated weather map layers; the one category
   where free genuinely caps out.

---

## Open questions for the product owner

- **Gate by trip type or a toggle?** Auto-show for `backpacking` only, or a
  per-trip "backcountry mode" the organizer flips (so a `camping`/`ski` trip can
  opt in)?
- **Which paid upgrade, if any, ships first** — topo tiles (visual) or Windy
  layers (weather)? Both have free starting tiers except Windy's map layer.
- **US-only vs global for alerts.** NWS is free but US-only; global alerts need a
  keyed provider. Ship US-first?
- **How much route-building in-app** vs. import-a-GPX-only for the first cut?
