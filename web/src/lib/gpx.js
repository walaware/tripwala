// GPX track handling — isomorphic + dependency-free so it runs in the browser
// (parse an uploaded file) AND on the server (re-derive stats from stored
// geometry, so we never trust client-computed numbers). Parsing is regex-based
// rather than DOMParser-based specifically so it works in Node and is unit-
// testable. Handles GPX track points (<trkpt>) and route points (<rtept>),
// self-closing or with a child <ele>. Covers exports from AllTrails, Gaia,
// CalTopo, Strava, Wikiloc, etc.

const MAX_POINTS = 2000; // stored geometry cap — plenty for a shape + profile

/** Decode the handful of XML entities that show up in GPX <name> text. */
function decodeXml(/** @type {string} */ s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/**
 * Parse a GPX document into a name + ordered points. Returns null when there's
 * no usable track. Elevation is null per-point when the file omits <ele>.
 * @param {string} xml
 * @returns {{ name: string, points: Array<{ lat: number, lng: number, ele: number | null }> } | null}
 */
export function parseGpx(xml) {
  if (typeof xml !== 'string' || xml.length < 10) return null;
  const nameMatch = xml.match(/<name>([\s\S]*?)<\/name>/i);
  const name = nameMatch ? decodeXml(nameMatch[1].trim()).slice(0, 120) : '';

  /** @type {Array<{ lat: number, lng: number, ele: number | null }>} */
  const points = [];
  const re = /<(?:trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/gi;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const lat = Number((attrs.match(/\blat\s*=\s*"([^"]+)"/i) || [])[1]);
    const lng = Number((attrs.match(/\blon\s*=\s*"([^"]+)"/i) || [])[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const eleM = inner.match(/<ele>\s*(-?[\d.]+)\s*<\/ele>/i);
    const ele = eleM ? Number(eleM[1]) : null;
    points.push({ lat, lng, ele: Number.isFinite(ele) ? ele : null });
  }
  return points.length ? { name, points } : null;
}

/** Great-circle distance in metres between two lat/lng points. */
export function haversine(/** @type {number} */ aLat, /** @type {number} */ aLng, /** @type {number} */ bLat, /** @type {number} */ bLng) {
  const R = 6371000;
  const toRad = (/** @type {number} */ d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Moving-average smooth an elevation series (nulls treated as gaps). Raw GPS/
 * barometric elevation is noisy; without this, total gain is wildly overcounted.
 * @param {Array<number | null>} eles @param {number} window
 * @returns {Array<number | null>}
 */
export function smoothElevations(eles, window = 5) {
  const half = Math.floor(window / 2);
  return eles.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      const v = eles[j];
      if (j >= 0 && j < eles.length && Number.isFinite(v)) {
        sum += /** @type {number} */ (v);
        n++;
      }
    }
    return n ? sum / n : null;
  });
}

/**
 * Distance, elevation gain/loss, and min/max for a track. Gain/loss use a
 * smoothed series + a small threshold so GPS jitter doesn't inflate the numbers.
 * @param {Array<{ lat: number, lng: number, ele: number | null }>} points
 */
export function trackStats(points) {
  const count = Array.isArray(points) ? points.length : 0;
  if (count < 2) return { distanceM: 0, gainM: 0, lossM: 0, minEle: null, maxEle: null, hasEle: false, count };

  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    distanceM += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }

  const eles = points.map((p) => (Number.isFinite(p.ele) ? p.ele : null));
  const hasEle = eles.some((e) => e != null);
  let gainM = 0;
  let lossM = 0;
  /** @type {number | null} */ let minEle = null;
  /** @type {number | null} */ let maxEle = null;
  if (hasEle) {
    // Min/max are the RAW trail extremes (what a hiker actually sees); gain/loss
    // use a smoothed series so GPS jitter doesn't inflate the ascent total.
    for (const e of eles) {
      if (e == null) continue;
      if (minEle == null || e < minEle) minEle = e;
      if (maxEle == null || e > maxEle) maxEle = e;
    }
    const smooth = smoothElevations(eles, 5);
    let prev = null;
    const THRESH = 1; // metres — ignore sub-metre wiggle
    for (const e of smooth) {
      if (e == null) continue;
      if (prev != null) {
        const d = e - prev;
        if (d >= THRESH) gainM += d;
        else if (d <= -THRESH) lossM += -d;
      }
      prev = e;
    }
  }
  return {
    distanceM: Math.round(distanceM),
    gainM: Math.round(gainM),
    lossM: Math.round(lossM),
    minEle: minEle == null ? null : Math.round(minEle),
    maxEle: maxEle == null ? null : Math.round(maxEle),
    hasEle,
    count
  };
}

/**
 * Uniformly reduce a track to at most `max` points, always keeping the first and
 * last. Preserves shape well enough for a map line + elevation profile without a
 * heavy Douglas–Peucker pass. Gain/loss are computed on the FULL track first.
 * @param {Array<{ lat: number, lng: number, ele: number | null }>} points @param {number} max
 */
export function decimate(points, max = MAX_POINTS) {
  if (!Array.isArray(points) || points.length <= max) return points || [];
  const out = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * Points → GeoJSON LineString coordinates ([lng, lat] or [lng, lat, ele]).
 * @param {Array<{ lat: number, lng: number, ele: number | null }>} points
 */
export function toCoordinates(points) {
  return points.map((p) => (p.ele == null ? [p.lng, p.lat] : [p.lng, p.lat, p.ele]));
}

/**
 * GeoJSON LineString coordinates → points. Tolerant of 2D/3D and junk.
 * @param {any} coords
 * @returns {Array<{ lat: number, lng: number, ele: number | null }>}
 */
export function fromCoordinates(coords) {
  if (!Array.isArray(coords)) return [];
  /** @type {Array<{ lat: number, lng: number, ele: number | null }>} */
  const out = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    const ele = c.length > 2 && Number.isFinite(Number(c[2])) ? Number(c[2]) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ lat, lng, ele });
  }
  return out;
}

/**
 * Server-side guard: sanitize client-sent coordinates into a bounded, well-formed
 * LineString coordinate array (or null if there's nothing valid). Caps length.
 * @param {any} coords
 * @returns {number[][] | null}
 */
export function sanitizeCoordinates(coords) {
  const pts = fromCoordinates(coords);
  if (pts.length < 2) return null;
  return toCoordinates(decimate(pts, MAX_POINTS));
}

/**
 * Build the elevation profile for the chart: cumulative distance (m) vs
 * elevation, downsampled to ~samples points. Returns [] when the track has no
 * elevation. Each entry also keeps its source index so the map can sync a marker.
 * @param {Array<{ lat: number, lng: number, ele: number | null }>} points @param {number} samples
 */
export function elevationProfile(points, samples = 120) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const eles = smoothElevations(points.map((p) => (Number.isFinite(p.ele) ? p.ele : null)), 5);
  if (!eles.some((e) => e != null)) return [];
  // Cumulative distance per point.
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum[i] = cum[i - 1] + haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  const total = cum[cum.length - 1] || 1;
  const n = Math.min(samples, points.length);
  /** @type {Array<{ distM: number, ele: number, index: number }>} */
  const out = [];
  let last = null;
  for (let s = 0; s < n; s++) {
    const idx = Math.round((s * (points.length - 1)) / (n - 1));
    const e = eles[idx];
    if (e == null) continue;
    out.push({ distM: cum[idx], ele: e, index: idx });
    last = idx;
  }
  // Ensure the final point is present so the profile spans the whole distance.
  if (last !== points.length - 1 && eles[points.length - 1] != null) {
    out.push({ distM: total, ele: /** @type {number} */ (eles[points.length - 1]), index: points.length - 1 });
  }
  return out;
}

export { MAX_POINTS };
