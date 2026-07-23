import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGpx, haversine, trackStats, decimate, toCoordinates, fromCoordinates,
  sanitizeCoordinates, elevationProfile, cumulativeDistances, projectOntoRoute
} from './gpx.js';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Big Pines Loop</name><trkseg>
    <trkpt lat="34.3800" lon="-117.6900"><ele>2000</ele></trkpt>
    <trkpt lat="34.3810" lon="-117.6900"><ele>2050</ele></trkpt>
    <trkpt lat="34.3820" lon="-117.6900"><ele>2100</ele></trkpt>
    <trkpt lat="34.3830" lon="-117.6900"><ele>2040</ele></trkpt>
  </trkseg></trk>
</gpx>`;

test('parseGpx: extracts name + points with elevation', () => {
  const r = parseGpx(GPX);
  assert.ok(r);
  assert.equal(r.name, 'Big Pines Loop');
  assert.equal(r.points.length, 4);
  assert.deepEqual(r.points[0], { lat: 34.38, lng: -117.69, ele: 2000 });
});

test('parseGpx: unwraps a CDATA-wrapped name (AllTrails/Gaia)', () => {
  const xml = `<gpx><trk><name><![CDATA[Big Pine Lakes Trail]]></name><trkseg>
    <trkpt lat="34.38" lon="-117.69"><ele>2000</ele></trkpt>
    <trkpt lat="34.39" lon="-117.69"><ele>2100</ele></trkpt>
  </trkseg></trk></gpx>`;
  const r = parseGpx(xml);
  assert.ok(r);
  assert.equal(r.name, 'Big Pine Lakes Trail');
});

test('parseGpx: self-closing points and rtept, missing ele → null', () => {
  const xml = `<gpx><rte><rtept lat="1.0" lon="2.0"/><rtept lat="1.1" lon="2.1"/></rte></gpx>`;
  const r = parseGpx(xml);
  assert.ok(r);
  assert.equal(r.points.length, 2);
  assert.equal(r.points[0].ele, null);
});

test('parseGpx: junk / empty → null', () => {
  assert.equal(parseGpx(''), null);
  assert.equal(parseGpx('<gpx></gpx>'), null);
  assert.equal(parseGpx(/** @type {any} */ (null)), null);
});

test('parseGpx: skips out-of-range coords', () => {
  const xml = `<gpx><trkseg><trkpt lat="200" lon="0"/><trkpt lat="10" lon="10"/><trkpt lat="11" lon="11"/></trkseg></gpx>`;
  const r = parseGpx(xml);
  assert.ok(r);
  assert.equal(r.points.length, 2);
});

test('haversine: known distance ~ 111km per degree of latitude', () => {
  const d = haversine(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111195) < 500, `got ${d}`);
});

test('trackStats: distance, gain, loss, min/max', () => {
  const r = parseGpx(GPX);
  assert.ok(r);
  const s = trackStats(r.points);
  assert.ok(s.hasEle);
  assert.equal(s.count, 4);
  assert.ok(s.distanceM > 0);
  assert.ok(s.gainM > 0);
  assert.ok(s.lossM > 0);
  assert.equal(s.minEle, 2000);
  assert.ok(s.maxEle != null && s.maxEle >= 2040 && s.maxEle <= 2100);
});

test('trackStats: no elevation → hasEle false, gain 0', () => {
  const s = trackStats([{ lat: 0, lng: 0, ele: null }, { lat: 0, lng: 1, ele: null }]);
  assert.equal(s.hasEle, false);
  assert.equal(s.gainM, 0);
  assert.ok(s.distanceM > 0);
});

test('trackStats: fewer than 2 points → zeros', () => {
  assert.deepEqual(trackStats([]), { distanceM: 0, gainM: 0, lossM: 0, minEle: null, maxEle: null, hasEle: false, count: 0 });
});

test('decimate: caps length, keeps endpoints', () => {
  const pts = Array.from({ length: 100 }, (_, i) => ({ lat: i * 0.001, lng: 0, ele: i }));
  const d = decimate(pts, 10);
  assert.equal(d.length, 10);
  assert.deepEqual(d[0], pts[0]);
  assert.deepEqual(d[d.length - 1], pts[99]);
});

test('toCoordinates / fromCoordinates round-trip (3D + 2D)', () => {
  const pts = [{ lat: 34.38, lng: -117.69, ele: 2000 }, { lat: 34.39, lng: -117.68, ele: null }];
  const coords = toCoordinates(pts);
  assert.deepEqual(coords, [[-117.69, 34.38, 2000], [-117.68, 34.39]]);
  assert.deepEqual(fromCoordinates(coords), pts);
});

test('sanitizeCoordinates: bounds, rejects garbage, caps count', () => {
  assert.equal(sanitizeCoordinates('nope'), null);
  assert.equal(sanitizeCoordinates([[0, 0]]), null); // needs >= 2
  const big = Array.from({ length: 5000 }, (_, i) => [0, i * 0.001, i]);
  const out = sanitizeCoordinates(big);
  assert.ok(out);
  assert.ok(out.length <= 2000);
  assert.deepEqual(out[0], [0, 0, 0]);
});

test('elevationProfile: cumulative distance vs elevation', () => {
  const r = parseGpx(GPX);
  assert.ok(r);
  const prof = elevationProfile(r.points, 50);
  assert.ok(prof.length >= 2);
  assert.equal(prof[0].distM, 0);
  assert.ok(prof[prof.length - 1].distM > 0);
  assert.ok(Number.isFinite(prof[0].ele));
  assert.equal(prof[prof.length - 1].index, r.points.length - 1);
});

test('cumulativeDistances: monotonic, starts at 0', () => {
  const pts = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }];
  const cum = cumulativeDistances(pts);
  assert.equal(cum[0], 0);
  assert.ok(cum[1] > 0);
  assert.ok(cum[2] > cum[1]);
});

test('projectOntoRoute: snaps a pin to the nearest vertex + its distance', () => {
  const pts = [
    { lat: 34.380, lng: -117.690 },
    { lat: 34.390, lng: -117.690 },
    { lat: 34.400, lng: -117.690 }
  ];
  // A campsite right by the middle vertex.
  const p = projectOntoRoute(pts, 34.3902, -117.6901);
  assert.ok(p);
  assert.equal(p.index, 1);
  assert.ok(p.gapM < 100); // within ~100 m of the route
  assert.ok(p.distM > 0);
});

test('projectOntoRoute: far-off point reports a large gap', () => {
  const pts = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
  const p = projectOntoRoute(pts, 10, 10);
  assert.ok(p);
  assert.ok(p.gapM > 100000); // clearly not on the route
});

test('projectOntoRoute: guards bad input', () => {
  assert.equal(projectOntoRoute([{ lat: 0, lng: 0 }], 0, 0), null);
  assert.equal(projectOntoRoute([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], NaN, 0), null);
});

test('elevationProfile: no elevation → empty', () => {
  const prof = elevationProfile([{ lat: 0, lng: 0, ele: null }, { lat: 0, lng: 1, ele: null }], 50);
  assert.deepEqual(prof, []);
});
