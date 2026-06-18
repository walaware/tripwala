# Rally API Layer — Design

> Status: **design** (not yet built). Build begins after the MVP build sequence
> has features worth exposing. See `README.md` build status.

## Goal

Let Rally be driven **programmatically and by AI tools** (any MCP client) without
duplicating business logic. One typed **service core** is the single source of
truth for all reads/mutations; both the web app and an **MCP server** consume it.

```
                 +-----------------------------+
                 |     @rally/core (TS)        |  business logic + zod validation
                 | trips / gear / meals / ...  |  + gear-remaining, token gen
                 +--------------+--------------+
                                |
          +---------------------+----------------------+
          |                                            |
   SvelteKit server                              @rally/mcp
   (load + form actions)                         (MCP server)
   participant / owner-token context             superuser context
          |                                            |
          +--------------------+-----------------------+
                               v
                          PocketBase
                    (REST + realtime + SQLite)
```

PocketBase already exposes full REST/realtime CRUD over every collection, so the
layer is **not** a re-implementation of CRUD — it is the typed, intention-
revealing, validated surface (`createTrip`, `claimGear`, …) plus the AI bridge.

## Proposed repo shape (pnpm workspace)

```
rally/
├── pnpm-workspace.yaml          # packages: web, mcp, packages/*
├── packages/
│   └── core/                    # @rally/core
│       ├── pocketbase.ts        # client factory w/ auth contexts
│       ├── schemas.ts           # zod input schemas (boundary validation)
│       ├── tokens.ts            # secure share_token / owner_token generation
│       └── services/            # trips.ts, gear.ts, meals.ts, packing.ts, ...
├── web/                         # imports @rally/core
├── mcp/                         # @rally/mcp — imports @rally/core
└── pocketbase/
```

Migration note: the existing `web/src/lib/server/loadTrip.js` already contains
the trip-loading + gear-remaining logic. Step 1 of the build below is to lift
that into `@rally/core` and have the web app import it back — no behavior change.

## Auth contexts (the core exposes three)

| Context                  | Capability                                   | Where used                  |
| ------------------------ | -------------------------------------------- | --------------------------- |
| `anonParticipant(share)` | Read + participant writes, one trip          | Web app, participant flows  |
| `ownerContext(owner)`    | Elevated edits within one trip               | Web owner/edit views        |
| `superuser()`            | Full instance control                        | **MCP management tools**    |

- `superuser()` authenticates with PocketBase superuser credentials from
  **server-side env only** (`PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD`, or a
  long-lived admin token). It is **never** shipped to the browser.
- The participant/owner contexts depend on the collection API rules that get
  hardened in **build-sequence step 9**. Until then those rules are open; the
  core's context boundary is still defined now so callers code against it.

## Service core surface (initial)

Each function: zod-validated input → PocketBase op (in the given auth context) →
plain typed return. Examples:

- Trips: `createTrip`, `getTripByShareToken`, `updateTrip`, `listTrips` (mgmt),
  `deleteTrip` (mgmt).
- Participants: `joinTrip`, `rejoinAs`, `setRsvp`.
- Gear: `addGearItem`, `claimGear`, `releaseClaim` (remaining computed here).
- Meals: `generateSlotsFromDates`, `addMealSlot`, `signupMeal`.
- Packing: `addPackingItem`, `togglePacking`.

## MCP server (`@rally/mcp`)

- Node MCP server (stdio for local AI tools; optional Streamable HTTP for remote).
- Tools mirror the service core under a `rally_*` namespace, each with a zod
  input schema and structured JSON output:
  `rally_create_trip`, `rally_list_trips`, `rally_get_trip`, `rally_add_gear`,
  `rally_generate_meals`, `rally_add_participant`, …
- All tools run in `superuser()` context (management surface).
- Optionally expose trips as MCP **resources** (`rally://trips/{id}`) for read.

### MCP security

- Superuser credentials live only in the MCP server's env.
- **stdio transport = local trust.** If exposed over HTTP, it MUST sit behind
  authentication + TLS — an unauthenticated networked MCP server with superuser
  creds is a full instance takeover.
- Rate-limit / log management mutations.

## Build order (after MVP)

1. Extract `@rally/core` from `web/src/lib/server/loadTrip.js`; refactor web to import it (no behavior change).
2. Add zod schemas + service functions incrementally as MVP features land.
3. Build `@rally/mcp` wrapping the core in superuser context.
4. Document the tool catalog + an example AI session.

## Related: participant accounts & OAuth linking (future, separate concern)

This management auth (superuser) is distinct from *participant* identity. The
MVP keeps participants account-less (`client_id` in localStorage). If/when an
optional account upgrade is added, OAuth providers attach via PocketBase's
`_externalAuths` collection, and **account linking must be done from an
authenticated session — never auto-merged by matching email** (account-takeover
vector; PocketBase has patched a pre-hijacking issue around exactly this). A
logged-in account would then "claim" participant rows via a nullable `user`
relation on `participants`, enabling a cross-trip "my trips" view.
