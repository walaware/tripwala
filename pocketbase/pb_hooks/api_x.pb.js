/// <reference path="../pb_data/types.d.ts" />

// walaware API Access — tripwala's curated, versioned API surface (`/api/x/v1/*`).
// Adopts templates/api-access/pb_hooks/api_x.pb.js. See docs/for-api.md.
//
// This is the ONLY programmatic door into tripwala's data for external consumers.
// Routes return a STABLE, documented payload (never a raw record). Every route:
//   1. `$apis.requireAuth("api_clients")` — only a live api_clients token gets in
//      (authRule "active = true" means a revoked client is rejected here).
//   2. `requireScope(e, "<scope>")` — the client's `scopes` must include it.
//   3. Shape the payload explicitly.
//   4. `audit(e, scope)` — one structured log line per call.
//
// The tailnet Caddy site proxies ONLY /api/x/* (see caddy/Caddyfile) — the raw
// /api/collections/* API and the /_/ admin UI are never reachable off-host.
//
// NOTE (deviation from the reference kit): PocketBase's JSVM runs each handler in
// an isolated context that CANNOT reference file-scope helpers — doing so throws
// ReferenceError at request time. So the shared helpers + the API_SURFACE manifest
// live in `api_x_lib.js` and every handler pulls them via require(). See that file.
//
// tripwala schema mapping (the standard's example fields are generic; real schema):
//   * No `trip_ideas` collection / no vote/title — a "trip idea" is a `trips` row
//     with status='idea'. `trip_ideas:read` surfaces those; `trips:read` the rest.
//   * `participants` has no `name` — the label is `display_name`, surfaced as name.
//   * No trip-level `note` field — `trips:write` APPENDS a note paragraph to the
//     trip's `description` (HTML editor field).

// ---------------------------------------------------------------------------
// Meta route — lets a consumer discover the surface it can reach. No data.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/x/v1/whoami', (e) => {
  const lib = require(`${__hooks}/api_x_lib.js`);
  lib.requireActive(e);
  lib.audit(e, 'whoami');
  return e.json(200, {
    client: e.auth.getString('name'),
    instance: e.auth.getString('instance') || null,
    scopes: e.auth.get('scopes') || [],
    api_version: lib.API_SURFACE.version
  });
}, $apis.requireAuth('api_clients'));

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

// GET /api/x/v1/trips?limit=50  — real (non-idea) trips.
routerAdd('GET', '/api/x/v1/trips', (e) => {
  const lib = require(`${__hooks}/api_x_lib.js`);
  lib.requireScope(e, 'trips:read');
  const records = e.app.findRecordsByFilter('trips', "status != 'idea'", '-created', lib.readLimit(e), 0);
  const items = records.map((r) => ({
    id: r.id,
    name: r.getString('name'),
    location: r.getString('location'),
    start_date: r.getString('start_date'),
    end_date: r.getString('end_date'),
    status: r.getString('status')
  }));
  lib.audit(e, 'trips:read');
  return e.json(200, { items, count: items.length });
}, $apis.requireAuth('api_clients'));

// GET /api/x/v1/trip_ideas?limit=50  — "someday" ideas (trips in status='idea').
routerAdd('GET', '/api/x/v1/trip_ideas', (e) => {
  const lib = require(`${__hooks}/api_x_lib.js`);
  lib.requireScope(e, 'trip_ideas:read');
  const records = e.app.findRecordsByFilter('trips', "status = 'idea'", '-created', lib.readLimit(e), 0);
  const items = records.map((r) => ({
    id: r.id,
    name: r.getString('name'),
    location: r.getString('location'),
    created: r.getString('created')
  }));
  lib.audit(e, 'trip_ideas:read');
  return e.json(200, { items, count: items.length });
}, $apis.requireAuth('api_clients'));

// GET /api/x/v1/participants?trip=<id>&limit=50  — trip membership.
routerAdd('GET', '/api/x/v1/participants', (e) => {
  const lib = require(`${__hooks}/api_x_lib.js`);
  lib.requireScope(e, 'participants:read');
  const trip = e.request.url.query().get('trip') || '';
  const filter = trip ? 'trip = {:trip}' : 'id != ""';
  const records = e.app.findRecordsByFilter('participants', filter, '-created', lib.readLimit(e), 0, { trip });
  const items = records.map((r) => ({
    id: r.id,
    trip: r.getString('trip'),
    name: r.getString('display_name'),
    role: r.getString('role')
  }));
  lib.audit(e, 'participants:read');
  return e.json(200, { items, count: items.length });
}, $apis.requireAuth('api_clients'));

// GET /api/x/v1/invitations?limit=50  — user-targeted trip invitations.
routerAdd('GET', '/api/x/v1/invitations', (e) => {
  const lib = require(`${__hooks}/api_x_lib.js`);
  lib.requireScope(e, 'invitations:read');
  const records = e.app.findRecordsByFilter('trip_invitations', 'id != ""', '-created', lib.readLimit(e), 0);
  const items = records.map((r) => ({
    id: r.id,
    trip: r.getString('trip'),
    status: r.getString('status')
  }));
  lib.audit(e, 'invitations:read');
  return e.json(200, { items, count: items.length });
}, $apis.requireAuth('api_clients'));

// ---------------------------------------------------------------------------
// WRITES (a separate, narrower allowlist — a read token can never reach these)
// ---------------------------------------------------------------------------

// POST /api/x/v1/trip_ideas   body: { "name": "…", "location"?: "…" }
// Creates a "someday" idea (a trips row in status='idea'). An API-created idea has
// NO organizer membership (no user behind an API token), so it is an orphan trip
// reachable only via the returned share_token / owner_token — a human can adopt it
// later via the owner-token claim flow. See docs/for-api.md.
routerAdd('POST', '/api/x/v1/trip_ideas', (e) => {
  const lib = require(`${__hooks}/api_x_lib.js`);
  lib.requireScope(e, 'trip_ideas:write');
  const body = new DynamicModel({ name: '', location: '' });
  e.bindBody(body);
  const name = (body.name || '').trim();
  if (!name || name.length > 200) {
    throw new ApiError(400, 'name is required and must be <= 200 chars');
  }

  const trips = e.app.findCollectionByNameOrId('trips');
  const record = new Record(trips);
  record.set('name', name);
  record.set('location', (body.location || '').trim());
  record.set('status', 'idea');
  record.set('visibility', 'private');
  // trips requires unique share_token + owner_token (min10/max64, [A-Za-z0-9_-]).
  record.set('owner_token', $security.randomString(24));
  let shareToken = '';
  for (let i = 0; i < 5; i++) {
    const candidate = 'idea-' + $security.randomString(16);
    let taken = false;
    try {
      e.app.findFirstRecordByFilter('trips', 'share_token = {:t}', { t: candidate });
      taken = true;
    } catch (_) {
      taken = false; // not found → free
    }
    if (!taken) {
      shareToken = candidate;
      break;
    }
  }
  if (!shareToken) {
    throw new ApiError(500, 'could not allocate a share token');
  }
  record.set('share_token', shareToken);
  e.app.save(record);

  lib.audit(e, 'trip_ideas:write');
  return e.json(200, {
    id: record.id,
    name: record.getString('name'),
    status: record.getString('status'),
    share_token: shareToken
  });
}, $apis.requireAuth('api_clients'));

// POST /api/x/v1/trips/{id}/note   body: { "note": "…" }
// Appends a note paragraph to the trip's `description` (there is no dedicated
// trip-note field). Additive — existing description is preserved.
routerAdd('POST', '/api/x/v1/trips/{id}/note', (e) => {
  const lib = require(`${__hooks}/api_x_lib.js`);
  lib.requireScope(e, 'trips:write');
  const id = e.request.pathValue('id');
  const body = new DynamicModel({ note: '' });
  e.bindBody(body);
  const note = (body.note || '').trim();
  if (!note || note.length > 500) {
    throw new ApiError(400, 'note is required and must be <= 500 chars');
  }

  let record;
  try {
    record = e.app.findRecordById('trips', id);
  } catch (_) {
    throw new ApiError(404, 'not found');
  }
  const existing = record.getString('description');
  record.set('description', existing + '<p>' + lib.escapeHtml(note) + '</p>');
  e.app.save(record);

  lib.audit(e, 'trips:write');
  return e.json(200, { id: record.id, note });
}, $apis.requireAuth('api_clients'));
