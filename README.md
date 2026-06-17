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
| Styling  | Tailwind CSS v4 + **Campfire** design system |
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

## Design system — Campfire

The UI implements the **Campfire** direction from the "Rally Design System"
Claude Design project: warm sand/coral palette, Fredoka + Nunito, soft corners,
coral-tinted shadows, and the signature pressable button "lip". Tokens live in
`web/src/app.css` (`@theme` → Tailwind utilities like `bg-coral-500`,
`rounded-lg`, `shadow-card`). Reusable primitives are in `web/src/lib/ui/`
(`Button`, `Card`/`CardHeader`, `Chip`, `Avatar`, `SegmentedControl`,
`ClaimRow`, `EmptyState`, `TextField`) — mirrors of the design-system
components. Avatar color is derived from the person's name (`lib/avatar.js`).

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
- [x] **Step 2** — create-trip flow + share-link generation
- [x] **Step 3** — identity-lite (name + client_id) and rejoin
- [ ] Step 4 — RSVP
- [ ] Step 5 — gear list + claims
- [ ] Step 6 — meal slots + signups
- [ ] Step 7 — packing checklist
- [ ] Step 8 — realtime wiring
- [ ] Step 9 — token / API-rule security hardening
- [ ] Step 10 — polish (mobile, optimistic UI, presence)

Demo trip share token: **`demo-rally-weekend`**

## Roadmap / platform direction (captured, not yet built)

Recorded so we don't lose them; each needs a dedicated planning pass.

- **Multi-trip, not single-trip.** An organizer creates many trips/events;
  attendees see every trip they're invited to / attending. A **dashboard +
  calendar view** across trips. The UI should not over-index on one trip. This
  implies cross-trip identity (ties into the optional accounts / OAuth-linking
  discussion in `docs/api-layer.md`).
- **Platforms:** responsive web (now) → installable **PWA** → native **iOS +
  Android via Capacitor** wrapping the same SvelteKit app, all consuming the same
  PocketBase instance API. A native app asks for an **instance URL** (self-host)
  or signs into the cloud.
- **Open core + paid cloud:** the app stays open-source and self-hostable; a
  hosted cloud plan (subscription) sells the convenience of not running it.
  Likely per-tenant instances first, multi-tenant later.
- **Expenses:** native split/settle-up (design system has `ExpenseRow` /
  `BalanceSummary`); evaluate reusing Spliit vs. porting its split math.
