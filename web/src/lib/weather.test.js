import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wmo, clampWindow, forecastUrl, dayWarnings, parseForecast, fmtDaylight, fmtElevation
} from './weather.js';

const NOW = new Date('2026-07-23T12:00:00Z');

test('wmo: known + unknown codes', () => {
  assert.deepEqual(wmo(0), ['☀️', 'Clear']);
  assert.deepEqual(wmo(95), ['⛈️', 'Thunderstorm']);
  assert.deepEqual(wmo(-1), ['🌡️', '']);
});

test('clampWindow: trims to the forecast horizon', () => {
  // Trip fully inside the window.
  assert.deepEqual(clampWindow('2026-07-24', '2026-07-26', NOW), {
    startDate: '2026-07-24',
    endDate: '2026-07-26'
  });
  // Trip starts before yesterday and runs long → clamps both ends.
  const w = clampWindow('2026-07-01', '2026-09-01', NOW);
  assert.ok(w);
  assert.equal(w.startDate, '2026-07-22'); // yesterday
  assert.equal(w.endDate, '2026-08-07'); // +15 days
});

test('clampWindow: null when the trip is entirely outside the window', () => {
  assert.equal(clampWindow('2027-01-01', '2027-01-05', NOW), null); // far future
  assert.equal(clampWindow('2020-01-01', '2020-01-05', NOW), null); // far past
  assert.equal(clampWindow('', '', NOW), null);
});

test('forecastUrl: includes hourly + daily vars and units', () => {
  const url = forecastUrl({
    lat: 34.38, lng: -117.69, startDate: '2026-07-24', endDate: '2026-07-26',
    tempQuery: 'fahrenheit', windQuery: 'mph', precipQuery: 'inch'
  });
  assert.match(url, /latitude=34.38/);
  assert.match(url, /longitude=-117.69/);
  assert.match(url, /temperature_unit=fahrenheit/);
  assert.match(url, /wind_speed_unit=mph/);
  assert.match(url, /precipitation_unit=inch/);
  assert.match(url, /start_date=2026-07-24/);
  assert.match(url, /sunrise/);
  assert.match(url, /apparent_temperature/);
});

test('dayWarnings (imperial): freeze, storm, wind, heavy rain', () => {
  const w = dayWarnings({ tmin: 28, tmax: 50, windMax: 30, gustMax: 45, precipSum: 0.8, code: 95 }, 'imperial');
  const kinds = w.map((x) => x.kind);
  assert.ok(kinds.includes('freeze'));
  assert.ok(kinds.includes('storm'));
  assert.ok(kinds.includes('high-wind'));
  assert.ok(kinds.includes('heavy-rain'));
});

test('dayWarnings: hard freeze supersedes freeze; snow classified', () => {
  const w = dayWarnings({ tmin: 15, tmax: 30, windMax: 5, gustMax: 8, precipSum: 1.2, code: 75 }, 'imperial');
  const kinds = w.map((x) => x.kind);
  assert.ok(kinds.includes('hard-freeze'));
  assert.ok(!kinds.includes('freeze'));
  assert.ok(kinds.includes('heavy-snow'));
});

test('dayWarnings (metric): thresholds differ', () => {
  // 1°C is not freezing in metric (<=0), but gusts 70 km/h trip the wind warning.
  const w = dayWarnings({ tmin: 1, tmax: 12, windMax: 50, gustMax: 70, precipSum: 2, code: 3 }, 'metric');
  const kinds = w.map((x) => x.kind);
  assert.ok(!kinds.includes('freeze'));
  assert.ok(kinds.includes('high-wind'));
});

test('dayWarnings: calm clear day has none', () => {
  assert.deepEqual(dayWarnings({ tmin: 55, tmax: 78, windMax: 6, gustMax: 10, precipSum: 0, code: 0 }, 'imperial'), []);
});

test('parseForecast: shapes hourly + daily with derived fields', () => {
  const json = {
    elevation: 2012,
    hourly: {
      time: ['2026-07-24T00:00', '2026-07-24T01:00'],
      temperature_2m: [60, 58],
      apparent_temperature: [57, 55],
      weather_code: [0, 2],
      precipitation: [0, 0.1],
      precipitation_probability: [5, 20],
      wind_speed_10m: [4, 6],
      wind_gusts_10m: [9, 12],
      cloud_cover: [10, 40]
    },
    daily: {
      time: ['2026-07-24'],
      weather_code: [95],
      temperature_2m_max: [80],
      temperature_2m_min: [30],
      precipitation_sum: [0.9],
      wind_speed_10m_max: [28],
      wind_gusts_10m_max: [46],
      sunrise: ['2026-07-24T05:52'],
      sunset: ['2026-07-24T20:06']
    }
  };
  const out = parseForecast(json, 'imperial');
  assert.equal(out.elevation, 2012);
  assert.equal(out.hours.length, 2);
  assert.equal(out.hours[0].temp, 60);
  assert.equal(out.hours[1].precipProb, 20);
  assert.equal(out.days.length, 1);
  assert.equal(out.days[0].daylightMins, 14 * 60 + 14); // 05:52 → 20:06
  const kinds = out.days[0].warnings.map((/** @type {{ kind: string }} */ w) => w.kind);
  assert.ok(kinds.includes('freeze'));
  assert.ok(kinds.includes('storm'));
});

test('parseForecast: tolerates missing arrays', () => {
  const out = parseForecast({}, 'imperial');
  assert.deepEqual(out, { hours: [], days: [], elevation: null });
});

test('fmtDaylight + fmtElevation', () => {
  assert.equal(fmtDaylight(642), '10h 42m');
  assert.equal(fmtDaylight(null), '');
  assert.equal(fmtDaylight(-5), '');
  assert.equal(fmtElevation(2012, true), '2010'); // metres → nearest 5
  assert.equal(fmtElevation(2012, false), '6600'); // → feet, nearest 10
  assert.equal(fmtElevation(null, false), '');
});
