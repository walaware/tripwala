// Pure parsing for the Notion trip importer — no I/O, no PocketBase. Everything
// here takes strings and returns plain data so it can be unit-tested and so the
// CLI (import-notion.mjs) stays a thin orchestration layer.
//
// A Notion "Markdown & CSV" export gives us, per database:
//   - one CSV: a header row of property names, then one row per trip
//   - one .md file per row (the page body) named "<Title> <32-hex page id>.md"
// We turn each (row, markdown) pair into a normalized "bundle" the importer
// upserts into tripwala's schema.
//
// NOTE: structureNotes() is the deliberate swap point for richer parsing. It
// ships as a heading/bullet heuristic; an LLM pass can replace it wholesale
// (same input → same {descriptionHtml, days} shape) once we see real notes.

const TRIP_TYPES = ['camping', 'backpacking', 'road_trip', 'cabin', 'ski', 'beach', 'city', 'festival', 'other'];

const TRIP_TYPE_SYNONYMS = {
  camping: 'camping', camp: 'camping', tent: 'camping',
  backpacking: 'backpacking', backpack: 'backpacking', trek: 'backpacking', trekking: 'backpacking', hiking: 'backpacking',
  road_trip: 'road_trip', 'road trip': 'road_trip', roadtrip: 'road_trip', drive: 'road_trip',
  cabin: 'cabin', lodge: 'cabin', airbnb: 'cabin',
  ski: 'ski', skiing: 'ski', snowboard: 'ski', snow: 'ski',
  beach: 'beach', coast: 'beach', surf: 'beach', island: 'beach',
  city: 'city', 'city break': 'city', urban: 'city', sightseeing: 'city',
  festival: 'festival', fest: 'festival', concert: 'festival'
};

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

const WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes (""),
 * and commas/newlines inside quotes. Returns header names + row objects.
 * @param {string} text
 * @returns {{ headers: string[], rows: Array<Record<string,string>> }}
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const out = nonEmpty.slice(1).map((r) => {
    /** @type {Record<string,string>} */
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
  return { headers, rows: out };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Case/space-insensitive column lookup. Returns the first row value whose header
 * matches any of the candidate names.
 * @param {Record<string,string>} row
 * @param {string[]} candidates
 */
export function pickColumn(row, candidates) {
  const wanted = candidates.map(norm);
  for (const key of Object.keys(row)) {
    if (wanted.includes(norm(key)) && row[key]?.trim()) return row[key].trim();
  }
  return '';
}

/** Map a free-text type onto the trip_type enum (default 'other'). */
export function mapTripType(raw) {
  const n = String(raw || '').toLowerCase().trim();
  if (!n) return 'other';
  if (TRIP_TYPES.includes(n.replace(/\s+/g, '_'))) return n.replace(/\s+/g, '_');
  if (TRIP_TYPE_SYNONYMS[n]) return TRIP_TYPE_SYNONYMS[n];
  for (const [k, v] of Object.entries(TRIP_TYPE_SYNONYMS)) {
    if (n.includes(k)) return v;
  }
  return 'other';
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Parse one date in the formats Notion emits (and a few common ones):
 * ISO "2024-03-03", "March 3, 2024", "Mar 3 2024", "3 March 2024".
 * @param {string} str
 * @returns {string|null} 'YYYY-MM-DD' or null
 */
export function parseDateLoose(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // "March 3, 2024" / "Mar 3 2024"
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(+m[2])}`;
  }
  // "3 March 2024"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`;
  }
  return null;
}

/**
 * Split a date or date-range string into {start, end}. Notion ranges use "→";
 * we also accept "->" and " - ". end is null for a single date.
 * @param {string} str
 * @returns {{ start: string|null, end: string|null }}
 */
export function parseDateRange(str) {
  const s = String(str || '').trim();
  if (!s) return { start: null, end: null };
  const parts = s.split(/\s*(?:→|->|—|–)\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { start: parseDateLoose(parts[0]), end: parseDateLoose(parts[1]) };
  }
  return { start: parseDateLoose(s), end: null };
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Strip a leading time token off a bullet ("9am Coffee" → {time:'9am', label:'Coffee'}). */
function splitTime(text) {
  const m = text.match(/^((?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|(?:\d{1,2}:\d{2}))\s*[-–—:]?\s+(.*)$/i);
  if (m && /\d/.test(m[1]) && m[2]) {
    // Only treat as a time if it actually reads like one (has am/pm or a colon).
    if (/am|pm|:/i.test(m[1])) return { time: m[1].trim(), label: m[2].trim() };
  }
  return { time: '', label: text };
}

/** Is this heading text a day boundary? Returns {date|null, dayIndex|null} or null. */
function asDayHeading(text) {
  const t = text.trim();
  const date = parseDateLoose(t);
  if (date) return { date, dayIndex: null };
  const dm = t.match(/^day\s*(\d+)/i);
  if (dm) return { date: null, dayIndex: +dm[1] };
  if (WEEKDAYS.has(t.toLowerCase().split(/[\s,]+/)[0])) return { date: null, dayIndex: null };
  return null;
}

/**
 * Turn a Notion page's markdown body into a trip description + day-by-day items.
 * Heuristic: text before the first day heading is the description; headings that
 * read like a date or "Day N" open a day; list bullets under a day become items.
 * Bundles with no day headings yield an empty days[] (description still captured).
 *
 * @param {string} markdown
 * @returns {{ descriptionHtml: string, days: Array<{ date: string|null, dayIndex: number|null, items: Array<{ time: string, label: string }> }> }}
 */
export function structureNotes(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const intro = [];
  /** @type {Array<{date:string|null,dayIndex:number|null,items:Array<{time:string,label:string}>}>} */
  const days = [];
  let current = null;
  let seenDay = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const day = asDayHeading(heading[2]);
      if (day) {
        seenDay = true;
        current = { date: day.date, dayIndex: day.dayIndex, items: [] };
        days.push(current);
        continue;
      }
      // A leading top-level H1 is the page title (== trip Name) — drop it as
      // redundant. Other preamble headings are kept as description text.
      if (!seenDay && !(heading[1] === '#' && intro.length === 0)) intro.push(heading[2]);
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.*)$/) || line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      const text = bullet[1].replace(/\*\*|__|`/g, '').trim();
      if (!text) continue;
      if (current) current.items.push(splitTime(text));
      else intro.push(text);
      continue;
    }
    if (!seenDay) intro.push(line);
  }

  const descriptionHtml = intro
    .map((p) => `<p>${escapeHtml(p.replace(/\*\*|__|`/g, ''))}</p>`)
    .join('');
  return { descriptionHtml, days };
}

/** Add N days to a 'YYYY-MM-DD' string (UTC-safe). */
export function addDays(ymd, n) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Build a normalized bundle from one CSV row + its page markdown. Pure: callers
 * pass externalId (derived from the .md filename) and immich is read from a col.
 *
 * @param {object} arg
 * @param {Record<string,string>} arg.row
 * @param {string} arg.markdown
 * @param {string} arg.externalId
 * @returns {object} bundle ready for the importer to upsert
 */
export function buildBundle({ row, markdown, externalId }) {
  const name = pickColumn(row, ['Name', 'Title', 'Trip', 'Trip Name']);
  const location = pickColumn(row, ['Location', 'Destination', 'Place', 'Where']);
  const immich = pickColumn(row, ['Immich', 'Immich Album', 'Album', 'Photos', 'Photo Album']);
  const typeRaw = pickColumn(row, ['Type', 'Trip Type', 'Category', 'Kind']);
  const statusRaw = pickColumn(row, ['Status', 'State']).toLowerCase();

  // Dates: prefer a single range column, else separate start/end columns.
  const rangeRaw = pickColumn(row, ['Dates', 'Date', 'When', 'Date Range', 'Trip Dates']);
  let { start, end } = parseDateRange(rangeRaw);
  if (!start) start = parseDateLoose(pickColumn(row, ['Start', 'Start Date', 'From']));
  if (!end) end = parseDateLoose(pickColumn(row, ['End', 'End Date', 'To']));

  const { descriptionHtml, days } = structureNotes(markdown);

  // Resolve each day to a concrete date where we can (explicit date, or
  // start_date + (Day N - 1)). Undated items stay undated ("to decide").
  const items = [];
  let sort = 0;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    let date = d.date;
    if (!date && d.dayIndex && start) date = addDays(start, d.dayIndex - 1);
    if (!date && start && days.length > 0 && d.dayIndex == null && d.date == null) {
      // sequential fallback: nth heading = start + n
      date = addDays(start, i);
    }
    for (const it of d.items) {
      items.push({ date, label: it.label.slice(0, 200), time: it.time.slice(0, 40), sort_order: sort++, kind: 'fixed' });
    }
  }

  const status = ['planning', 'confirmed', 'completed'].includes(statusRaw) ? statusRaw : 'completed';

  return {
    externalId,
    name: name || '(untitled trip)',
    location,
    start_date: start,
    end_date: end,
    description: descriptionHtml,
    trip_type: mapTripType(typeRaw),
    status,
    photo_album_url: /^https?:\/\//i.test(immich) ? immich : '',
    itinerary: items,
    warnings: [
      ...(name ? [] : ['missing Name']),
      ...(start ? [] : ['no start date parsed'])
    ]
  };
}
