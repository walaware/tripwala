// Pure weather helpers for the forecast surfaces (WeatherCard + the backpacking
// planner). Everything here is side-effect-free and unit-tested; the components
// own the fetch. Data comes from Open-Meteo (free, no key, CORS-enabled).
//
// One "unit system" (metric vs imperial) is derived from the user's temp pref in
// $lib/prefs.js — this module just takes the resolved Open-Meteo query values and
// the display thresholds that go with them.

// WMO weather code → [emoji, label]. Grouped to the buckets that matter; shared
// by every forecast surface so the icon vocabulary stays consistent.
/** @type {Record<number, [string, string]>} */
export const WMO = {
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

/** @param {number} code @returns {[string, string]} */
export const wmo = (code) => WMO[code] ?? ['🌡️', ''];

const THUNDER = new Set([95, 96, 99]);
const SNOW = new Set([71, 73, 75, 77, 85, 86, 66, 67, 56, 57]);

// Warning thresholds per unit system. Backcountry-relevant: what changes whether
// you go and what you pack.
const THRESHOLDS = {
  imperial: { freeze: 32, hardFreeze: 20, wind: 25, gust: 40, heavyPrecip: 0.5 }, // °F, mph, in
  metric: { freeze: 0, hardFreeze: -7, wind: 40, gust: 65, heavyPrecip: 12 } // °C, km/h, mm
};

/**
 * The Open-Meteo forecast horizon relative to today: yesterday .. +15 days.
 * Same window WeatherCard uses. All in UTC-day terms.
 * @param {Date} [now]
 */
export function horizon(now = new Date()) {
  const day = (/** @type {Date} */ d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const t = day(now);
  return { minMs: t - 86400000, maxMs: t + 15 * 86400000 };
}

/** ISO yyyy-mm-dd for a ms timestamp (UTC). @param {number} ms */
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Clamp a trip's [start, end] to the forecast horizon. Returns null when the
 * whole trip is outside the window (nothing to show). Dates are yyyy-mm-dd.
 * @param {string} start @param {string} end @param {Date} [now]
 * @returns {{ startDate: string, endDate: string } | null}
 */
export function clampWindow(start, end, now = new Date()) {
  const s = Date.parse(`${(start || '').slice(0, 10)}T00:00:00Z`);
  const e = Date.parse(`${(end || start || '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const { minMs, maxMs } = horizon(now);
  const lo = Math.max(s, minMs);
  const hi = Math.min(Math.max(e, s), maxMs);
  if (lo > maxMs || hi < minMs || lo > hi) return null;
  return { startDate: iso(lo), endDate: iso(hi) };
}

/**
 * Build the Open-Meteo forecast URL for the backpacking surface: hourly detail
 * for the scrobbler + a daily summary for the briefing.
 * @param {{ lat: number, lng: number, startDate: string, endDate: string,
 *   tempQuery: string, windQuery: string, precipQuery: string }} p
 */
export function forecastUrl(p) {
  const hourly = [
    'temperature_2m', 'apparent_temperature', 'precipitation', 'precipitation_probability',
    'weather_code', 'wind_speed_10m', 'wind_gusts_10m', 'cloud_cover'
  ].join(',');
  const daily = [
    'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum',
    'wind_speed_10m_max', 'wind_gusts_10m_max', 'sunrise', 'sunset'
  ].join(',');
  const q = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lng),
    hourly,
    daily,
    temperature_unit: p.tempQuery,
    wind_speed_unit: p.windQuery,
    precipitation_unit: p.precipQuery,
    timezone: 'auto',
    start_date: p.startDate,
    end_date: p.endDate
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

/** Minutes between two ISO datetimes (sunrise/sunset), or null. */
function daylightMinutes(/** @type {string} */ sunrise, /** @type {string} */ sunset) {
  const a = Date.parse(sunrise);
  const b = Date.parse(sunset);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

/**
 * Derive the backcountry warnings for one day. Honest, few, load-bearing.
 * @param {{ tmin: number, tmax: number, windMax: number, gustMax: number,
 *   precipSum: number, code: number }} d
 * @param {'metric'|'imperial'} system
 * @returns {Array<{ kind: string, emoji: string, label: string }>}
 */
export function dayWarnings(d, system) {
  const t = THRESHOLDS[system] ?? THRESHOLDS.imperial;
  /** @type {Array<{ kind: string, emoji: string, label: string }>} */
  const out = [];
  if (Number.isFinite(d.tmin) && d.tmin <= t.hardFreeze) out.push({ kind: 'hard-freeze', emoji: '🥶', label: 'Hard freeze' });
  else if (Number.isFinite(d.tmin) && d.tmin <= t.freeze) out.push({ kind: 'freeze', emoji: '❄️', label: 'Below freezing' });
  if (THUNDER.has(d.code)) out.push({ kind: 'storm', emoji: '⛈️', label: 'Thunderstorms' });
  const gust = Number.isFinite(d.gustMax) ? d.gustMax : d.windMax;
  if (Number.isFinite(gust) && gust >= t.gust) out.push({ kind: 'high-wind', emoji: '💨', label: 'High wind' });
  if (Number.isFinite(d.precipSum) && d.precipSum >= t.heavyPrecip) {
    out.push(SNOW.has(d.code) ? { kind: 'heavy-snow', emoji: '🌨️', label: 'Heavy snow' } : { kind: 'heavy-rain', emoji: '🌧️', label: 'Heavy rain' });
  }
  return out;
}

/**
 * Parse an Open-Meteo forecast response into the shape the backpacking surface
 * renders: an hourly series (the scrobbler) and a per-day briefing with warnings.
 * Tolerant of missing arrays — anything absent becomes an empty series.
 * @param {any} json @param {'metric'|'imperial'} system
 */
export function parseForecast(json, system) {
  const h = json?.hourly ?? {};
  const times = Array.isArray(h.time) ? h.time : [];
  const at = (/** @type {any[]} */ arr, /** @type {number} */ i) =>
    Array.isArray(arr) && Number.isFinite(arr[i]) ? arr[i] : null;
  const hours = times.map((/** @type {string} */ time, /** @type {number} */ i) => ({
    time,
    temp: at(h.temperature_2m, i),
    apparent: at(h.apparent_temperature, i),
    code: at(h.weather_code, i) ?? 0,
    precip: at(h.precipitation, i) ?? 0,
    precipProb: at(h.precipitation_probability, i) ?? 0,
    wind: at(h.wind_speed_10m, i) ?? 0,
    gust: at(h.wind_gusts_10m, i) ?? 0,
    cloud: at(h.cloud_cover, i) ?? 0
  }));

  const d = json?.daily ?? {};
  const dtimes = Array.isArray(d.time) ? d.time : [];
  const days = dtimes.map((/** @type {string} */ date, /** @type {number} */ i) => {
    const day = {
      date,
      code: at(d.weather_code, i) ?? 0,
      tmax: at(d.temperature_2m_max, i),
      tmin: at(d.temperature_2m_min, i),
      precipSum: at(d.precipitation_sum, i) ?? 0,
      windMax: at(d.wind_speed_10m_max, i) ?? 0,
      gustMax: at(d.wind_gusts_10m_max, i) ?? 0,
      sunrise: Array.isArray(d.sunrise) ? d.sunrise[i] : '',
      sunset: Array.isArray(d.sunset) ? d.sunset[i] : ''
    };
    return {
      ...day,
      daylightMins: daylightMinutes(day.sunrise, day.sunset),
      warnings: dayWarnings(
        { tmin: day.tmin ?? NaN, tmax: day.tmax ?? NaN, windMax: day.windMax, gustMax: day.gustMax, precipSum: day.precipSum, code: day.code },
        system
      )
    };
  });

  const elevation = Number.isFinite(json?.elevation) ? json.elevation : null;
  return { hours, days, elevation };
}

/** Format a daylight span in minutes as "10h 42m". @param {number|null} mins */
export function fmtDaylight(mins) {
  if (!Number.isFinite(mins) || mins == null || mins < 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Metres → the display unit (ft for imperial), rounded. @param {number|null} m */
export function fmtElevation(m, /** @type {boolean} */ metric) {
  if (!Number.isFinite(m) || m == null) return '';
  const v = metric ? m : m * 3.28084;
  // Round feet to the nearest 10, metres to the nearest 5 — spurious precision off.
  const step = metric ? 5 : 10;
  return `${Math.round(v / step) * step}`;
}
