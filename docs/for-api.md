# tripwala API

> Status: **drafted** (curated surface + migration shipped on `feat/api-access`;
> not yet deployed — the tailnet Caddy site + first token are operator steps).
> <!-- design | drafted | built -->

Programmatic, read-and-limited-write access to tripwala's data over a scoped API
token — no human login, no superuser. Part of the suite-wide
[API Access standard](https://github.com/walaware/.github/blob/main/docs/api-access.md).

> **Not to be confused with** [`api-layer.md`](./api-layer.md), a separate,
> future *management* design (a superuser-context MCP/service-core). This doc is
> the shipped, scoped, tailnet-only **consumer** surface — least privilege, never
> superuser.

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
