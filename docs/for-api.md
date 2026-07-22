# tripwala API

> Status: **drafted** (service-token curated surface + migration on `feat/api-access`;
> **personal keys** — user self-service, public edge — on `feat/personal-api-keys`).
> <!-- design | drafted | built -->

Programmatic, read-and-limited-write access to tripwala's data over a scoped API
token — no human login, no superuser. Part of the suite-wide
[API Access standard](https://github.com/walaware/.github/blob/main/docs/api-access.md).

> **Not to be confused with** [`api-layer.md`](./api-layer.md), a separate,
> future *management* design (a superuser-context MCP/service-core). This doc is
> the shipped, scoped **consumer** surface — least privilege, never superuser.

## Two modes

tripwala exposes the same `/api/x/v1` surface in **two modes**, distinguished by
whether a token is bound to a user. Both are scoped and revocable; neither is ever
a superuser.

| | **Service token** | **Personal key** |
| --- | --- | --- |
| Who mints | the operator (`api-token.sh`) | **you**, in-app at [`/settings/api-keys`](#personal-keys-self-service-public-edge) |
| Sees | the **whole app** | **only your own** trips (row-filtered) |
| Writes | whatever the scope allows | **only what you could do in the UI** (role-mirrored per trip) |
| Reachable | **tailnet only** | the **public** origin (the token is the sole gate) |
| Auth header | `Authorization: <token>` | `Authorization: Bearer <token>` |
| Served by | a PocketBase hook | the SvelteKit app server (reuses the app's own authz) |

The **service-token** contract is documented first; **personal keys** are the
[section below](#personal-keys-self-service-public-edge). If you're an end user
wanting a key for your own trips from Claude Code or a script, skip to that section.

# Service tokens (tailnet)

## The consumer contract

Once you have a token, you need exactly two things:

```bash
export TRIPWALA_API_URL="https://<host>.<tailnet>.ts.net/api/x/v1"
export TRIPWALA_API_TOKEN="<your scoped token>"

curl -H "Authorization: $TRIPWALA_API_TOKEN" "$TRIPWALA_API_URL/whoami"
```

- **Tailnet only.** The API is reachable **only over the trusted tailnet**
  (Tailscale), not tripwala's public edge (which still exposes only `/api/files/*`).
- **`Authorization: <token>`** — the raw token, no `Bearer` prefix (PocketBase
  convention).
- Every response is JSON. Errors are `{ "status", "message" }` with a 4xx/5xx code.

## Scopes

A token carries a fixed set of scopes. Reads and writes are **separate**
allowlists — a read token cannot write.

| Scope | Kind | Grants |
| --- | --- | --- |
| `trips:read` | read | Trips (excluding ideas): `id, name, location, start_date, end_date, status` |
| `trip_ideas:read` | read | "Someday" trip ideas — trips in `status='idea'`: `id, name, location, created` |
| `participants:read` | read | Trip membership: `id, trip, name, role` (`name` = display name; `role` ∈ organizer\|guest) |
| `invitations:read` | read | User-targeted trip invitations: `id, trip, status` |
| `trip_ideas:write` | write | Create a "someday" idea (a trip in `status='idea'`) |
| `trips:write` | write | Append a note paragraph to a trip's description |

### tripwala schema notes (why fields differ from the standard's examples)

The standard's example field lists are generic; these are the real mappings:

- **No `trip_ideas` collection.** A "trip idea" is a `trips` row with
  `status='idea'` (there is no `votes`/`title`). `trip_ideas:read` returns those
  trips; `trips:read` returns the non-idea trips. `trip_ideas:write` creates one.
- **`participants` has no `name`** — the label field is `display_name`, surfaced
  as `name`.
- **No trip-level `note` field.** `trips:write` **appends** a note paragraph to
  the trip's `description` (an HTML editor field); it never overwrites.

## Endpoints

> The payloads below are the **stable contract** — internal collections/fields may
> change underneath; these shapes will not (within `v1`).

### `GET /whoami`

Your client name, instance, and granted scopes. No scope required.

```json
{ "client": "tripwala-concierge", "instance": null, "scopes": ["trips:read"], "api_version": "v1" }
```

### `GET /trips` — scope `trips:read`

Real (non-idea) trips, newest first. Query: `limit` (default 50, max 200).

```json
{ "items": [ { "id": "abc123", "name": "Big Sur", "location": "CA", "start_date": "2026-08-01 00:00:00.000Z", "end_date": "2026-08-04 00:00:00.000Z", "status": "confirmed" } ], "count": 1 }
```

### `GET /trip_ideas` — scope `trip_ideas:read`

"Someday" ideas (trips in `status='idea'`). Query: `limit`.

```json
{ "items": [ { "id": "idg9", "name": "Vancouver Island roadtrip", "location": "", "created": "2026-07-10 12:00:00.000Z" } ], "count": 1 }
```

### `GET /participants?trip=<id>` — scope `participants:read`

Trip membership. Optional `trip` filters to one trip; omit for all. Query: `limit`.

```json
{ "items": [ { "id": "p1", "trip": "abc123", "name": "Sam", "role": "organizer" } ], "count": 1 }
```

### `GET /invitations` — scope `invitations:read`

User-targeted trip invitations. Query: `limit`.

```json
{ "items": [ { "id": "iv1", "trip": "abc123", "status": "pending" } ], "count": 1 }
```

### `POST /trip_ideas` — scope `trip_ideas:write`

Create a "someday" idea. Body:

```json
{ "name": "Iceland ring road", "location": "Iceland" }
```

Returns the idea plus its `share_token`. **Note:** an API-created idea has no
organizer membership (there's no user behind an API token), so it's an orphan
trip reachable only via the returned `share_token` / `owner_token` — a human can
adopt it later through the owner-token claim flow.

```json
{ "id": "idNew", "name": "Iceland ring road", "status": "idea", "share_token": "idea-a1b2c3d4e5f6g7h8" }
```

### `POST /trips/{id}/note` — scope `trips:write`

Append a note paragraph to a trip's description (additive). Body:

```json
{ "note": "Ferry booked for the 3rd." }
```

```json
{ "id": "abc123", "note": "Ferry booked for the 3rd." }
```

## Getting & rotating a token

Tokens are minted by the tripwala operator, not self-served:

- **Request one** with the scopes you need and justify.
- The operator runs `scripts/api-token.sh create <name> "<scopes>"` (single
  instance — no instance arg) and hands you the token over a secure channel. Store
  it in your own secret manager.
- **Rotation:** `scripts/api-token.sh rotate <name>` — your old token stops
  working immediately and you get a fresh one. Rotate on a schedule and on any
  suspected exposure.
- **Revocation:** `scripts/api-token.sh revoke <name>` (sets `active = false`)
  disables the token instantly.

## Security notes

- Least-privilege: you only get the scopes you asked for and justified. No `*`.
- No token ever carries superuser rights or reaches the `/_/` admin UI or the raw
  `/api/collections/*` API. The curated `/api/x/*` surface is the only door.
- Every call is audit-logged (client, scope, method, path) server-side; scope
  denials log a warning.
- tripwala is single-instance, so tokens carry no `instance`.

# Personal keys (self-service, public edge)

A **personal key** is a token you mint for **your own** data — to reach your trips
from an AI agent (Claude Code, a chatbot) or a script, from anywhere. The governing
rule is one sentence:

> **A personal key can do exactly what you can already do in tripwala — no more.**
> Reads are confined to your trips; writes follow your `organizer`/`guest` role on
> each trip. The key is a headless session as you, not a new capability.

So a key can never see a trip you're not a member of, and a **guest**'s key gets the
same 403 on an organizer-only edit that the UI gives you.

## The consumer contract

```bash
export TRIPWALA_API_URL="https://tripwala.enzoiwith.us/api/x/v1"   # the PUBLIC origin
export TRIPWALA_API_TOKEN="<the key you copied at creation>"

curl -H "Authorization: Bearer $TRIPWALA_API_TOKEN" "$TRIPWALA_API_URL/whoami"
```

- **Public origin.** Unlike service tokens, personal keys are reached over
  tripwala's public URL — your agent doesn't need to be on the tailnet. The token
  is therefore the *only* gate: keep it secret.
- **`Authorization: Bearer <token>`** — note the `Bearer` prefix (service tokens omit it).
- The public edge still exposes **only** `/api/x/*`. `/_/` (admin) and
  `/api/collections/*` (raw records) are unreachable — a key widens the curated door
  only.
- **Rate limited** per key (120 requests/minute). A `429` means slow down.
- Every response is JSON; errors are `{ "message": "…" }` with a 4xx/5xx code.

## Create / revoke a key

Self-service, while signed in:

1. Go to **Profile → API keys** ([`/settings/api-keys`](/settings/api-keys)).
2. **Create key** → name it (e.g. `claude-code`) → the full token is shown
   **once**. Copy it now; it's never recoverable.
3. Your list shows each key's name, a short fingerprint, when it was created, and
   when it was last used — so you can spot a stale or leaked one.
4. **Revoke** disables a key instantly and permanently (it stops working on the
   next call). Lost a key? Revoke it and make a new one.

## Scopes (all user-confined)

Every personal key is granted the full set below by default — the per-user and
per-role narrowing does the real gating, so "all scopes" still only ever means
"everything **you** could click".

| Scope | Kind | Grants (confined to your trips) |
| --- | --- | --- |
| `trips:read` | read | Your trips (non-idea): `id, name, location, start_date, end_date, status` |
| `trip_ideas:read` | read | Your "someday" ideas (`status='idea'`): `id, name, location, created` |
| `participants:read` | read | Members of your trips: `id, trip, name, role` |
| `invitations:read` | read | Trip invitations addressed to you: `id, trip, status` |
| `trip_ideas:write` | write | Create a "someday" idea (you become its organizer) |
| `trips:write` | write | Edit a trip / append a note — **organizer on that trip only** |

## Endpoints

Same paths and payload shapes as the service surface (one contract), but
**user-confined**. Differences called out below.

### `GET /whoami`

Your key, the resolved user, and granted scopes.

```json
{ "key": "claude-code", "user": { "id": "u123", "email": "you@example.com", "name": "Sam" }, "scopes": ["trips:read", "…"], "api_version": "v1" }
```

### `GET /trips` — `trips:read`

Your non-idea trips. `{ items: [{ id, name, location, start_date, end_date, status }], count }`.

### `GET /trip_ideas` — `trip_ideas:read`

Your idea-stage trips. `{ items: [{ id, name, location, created }], count }`.

### `GET /participants?trip=<id>` — `participants:read`

Members of your trips. Optional `?trip=` narrows to one of **your** trips (a trip
you're not in returns nothing — never another trip's roster).
`{ items: [{ id, trip, name, role }], count }`.

### `GET /invitations` — `invitations:read`

Trip invitations addressed to you. `{ items: [{ id, trip, status }], count }`.

### `POST /trip_ideas` — `trip_ideas:write`

Create a "someday" idea. Body `{ "name": "…", "location"?: "…" }`. Unlike the
service surface's orphan ideas, this one is **owned by you** (you're enrolled as its
organizer and it appears on your Ideas list).

```json
{ "id": "idNew", "name": "Iceland ring road", "location": "Iceland", "status": "idea", "share_token": "reef-otter-pine-lake" }
```

### `POST /trips/{id}/note` — `trips:write` · **organizer only**

Append a note paragraph to a trip's description (additive). Body `{ "note": "…" }`.
A guest's key gets `403 Only organizers can edit the trip`.

### `PATCH /trips/{id}` — `trips:write` · **organizer only**

Edit a trip's core fields. Body: any of `{ name, location, start_date, end_date }`
(dates `YYYY-MM-DD`; only the fields you send change). Returns the updated trip.

## Using it with Claude Code

Point Claude Code (or any agent) at the API with two env vars:

```bash
export TRIPWALA_API_URL="https://tripwala.enzoiwith.us/api/x/v1"
export TRIPWALA_API_TOKEN="<your key>"

# your upcoming trips
curl -s -H "Authorization: Bearer $TRIPWALA_API_TOKEN" "$TRIPWALA_API_URL/trips" | jq

# capture a note on a trip you organize
curl -s -X POST -H "Authorization: Bearer $TRIPWALA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"Ferry booked for the 3rd."}' \
  "$TRIPWALA_API_URL/trips/<tripId>/note" | jq
```

## Security notes

- **User-confined, always.** Every read is filtered to trips you're an active member
  of; every write is checked against your role on that trip — using the *same*
  server authz the UI uses ([`$lib/server/tripAuthz.js`](../web/src/lib/server/tripAuthz.js)),
  never a second copy of the rules.
- **Instant revoke.** Revoking sets `active = false` and resets the record's token
  key, so the JWT is cryptographically dead on the next call (validation is an
  `authRefresh`, which fails closed on both).
- No personal key carries superuser rights or reaches `/_/` or `/api/collections/*`.
- Every call is audit-logged (key, user, scope, method, path); scope denials warn.
- **Two modes can't be crossed.** The tailnet `/api/x/*` site serves the
  *service-token* hook (whole-app); the public edge serves *personal keys*
  (user-confined). A personal key presented to the tailnet hook is **rejected**
  (`403 personal keys are not valid on this surface`), and a service token is
  rejected on the public edge — the `user`-bound flag gates each surface to its
  own mode, so a token can never be used against the wrong one.
