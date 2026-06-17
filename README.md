# Rally (rallypoint)

> One link where the group gathers. A self-hosted web app for coordinating group
> trips — camping, backpacking, road trips, cabins. **No mandatory accounts:** a
> per-trip share token in the URL plus a lightweight "claim your name" identity.

A trip is one page with one shareable link. People open it, claim a name, and
interact — RSVP, claim gear, sign up for meals, check off packing. Everyone sees
the same live state.

## Stack

| Layer    | Choice                                  |
| -------- | --------------------------------------- |
| Backend  | PocketBase 0.39.4 (single Go binary)    |
| Frontend | SvelteKit 2 + Svelte 5 (adapter-node)   |
| Styling  | Tailwind CSS v4                          |
| Proxy    | Caddy (single origin)                   |
| Deploy   | Docker Compose                          |

## Project layout

```
rally/
├── docker-compose.yml        # full stack: pocketbase + web + caddy
├── Caddyfile                 # routes /api,/_ → PocketBase, rest → SvelteKit
├── pocketbase/
│   ├── Dockerfile            # pinned PB build
│   └── pb_migrations/        # schema + dev seed (auto-applied on serve)
└── web/                      # SvelteKit app
    └── src/
        ├── lib/server/       # per-request PocketBase client + trip loader
        ├── lib/format.js     # date helpers
        └── routes/
            ├── +page.svelte           # landing
            └── [share_token]/         # the trip page (the product)
```

## Run the whole stack (Docker)

```bash
docker compose up --build
# open http://localhost:8080/demo-rally-weekend
# admin UI: http://localhost:8080/_/   (create superuser, see below)
```

Create the admin superuser once after first start:

```bash
docker compose exec pocketbase /pb/pocketbase superuser upsert admin@rally.local <password>
```

## Local development (no Docker)

Two terminals:

```bash
# 1) PocketBase (downloads to ./pocketbase/pocketbase — see below)
cd pocketbase && ./pocketbase serve --http=127.0.0.1:8090

# 2) Web
cd web && pnpm install && pnpm dev
# open http://localhost:5173/demo-rally-weekend
```

The Vite dev server proxies `/api` and `/_` to PocketBase, and the SvelteKit
server load talks to it directly at `http://127.0.0.1:8090`.

The PocketBase binary is gitignored. Download the pinned version:

```bash
cd pocketbase
curl -sL -o pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.39.4/pocketbase_0.39.4_$(uname -s | tr A-Z a-z)_$([ "$(uname -m)" = arm64 ] && echo arm64 || echo amd64).zip
unzip -o pb.zip pocketbase && rm pb.zip
```

Migrations in `pb_migrations/` apply automatically on `serve` (or `./pocketbase migrate up`).

## Data model

`trips`, `participants`, `gear_items`, `gear_claims`, `meal_slots`,
`meal_signups`, `packing_items` — see `pocketbase/pb_migrations/*_init_schema.js`.

- `participants.client_id` — random UUID stored in localStorage; the no-account
  trick that maps a browser to a participant without a password.
- Gear "remaining" = `qty_needed − sum(gear_claims.qty_claimed)`, computed in
  `web/src/lib/server/loadTrip.js`.

## ⚠️ Security boundary (not yet done)

Collection API rules are currently **open** so the scaffold renders end-to-end.
The intended model: the `share_token` in the URL is the read capability, and a
participant may only write to their own trip's rows. This is **build-sequence
step 9** and must be hardened before any public deployment with write paths.
Search the code for "security boundary" to find the spots that call this out.

## Build status

- [x] **Scaffold** — Docker Compose (PocketBase + SvelteKit + Tailwind + Caddy)
- [x] **Step 1** — trips collection + the trip page rendering live from a seed
- [ ] Step 2 — create-trip flow + share-link generation
- [ ] Step 3 — identity-lite (name + client_id) and rejoin
- [ ] Step 4 — RSVP
- [ ] Step 5 — gear list + claims
- [ ] Step 6 — meal slots + signups
- [ ] Step 7 — packing checklist
- [ ] Step 8 — realtime wiring
- [ ] Step 9 — token / API-rule security hardening
- [ ] Step 10 — polish (mobile, optimistic UI, presence)

Demo trip share token: **`demo-rally-weekend`**
