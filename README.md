<div align="center">

# 🧭 tripwala

**One link where the group gathers.**

A self-hosted web app for coordinating group trips — camping, backpacking, road
trips, cabin weekends. Share one invite link; everyone signs in to join, then
RSVPs, claims gear, signs up for food, and checks off packing — all on the same
live page, private to the people you invite.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Built with SvelteKit](https://img.shields.io/badge/SvelteKit-5-ff3e00.svg)](https://kit.svelte.dev)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.39-b8dbe4.svg)](https://pocketbase.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![AI-developed](https://img.shields.io/badge/built_with-AI_%2B_human_review-7c3aed.svg)](https://github.com/walaware/.github/blob/main/AI_POLICY.md)

</div>

---

## Why tripwala?

Every group trip starts as a Notion page or a group-chat scroll — read-only, dead,
and nobody updates it. tripwala is the opposite: **shared, live state behind one
invite link.** Open the link on your phone, sign in (Google or email), and
you're in — and only invited guests can see the details.

The killer feature: **gear claims without collisions.** No more three tents and
zero stoves — claim "I'll bring it" and everyone sees it's covered, instantly.

## Features

- 🔗 **One invite link, real accounts.** Share a per-trip link; guests sign in
  with Google or email to join. Only invited, signed-in members see the trip —
  non-members get just a teaser (name + a blurb).
- 🙌 **RSVP** — Going / Maybe / Can't, at a glance.
- 🎒 **Gear claims, collision-safe.** Claim items so nobody doubles up; claiming
  drops it onto your personal packing list automatically.
- 🍳 **Meal sign-ups** — slots auto-generated from the trip dates, with dish notes.
- 🧳 **Packing** — a shared group list plus your own personal checklist.
- ⚡ **Feels live** — the page refreshes itself; everyone sees changes within
  seconds.
- 📱 **Mobile-first**, responsive up to desktop, with the warm **Campfire**
  design system.
- 🏠 **Self-hostable** in one Docker stack. Open source (AGPL-3.0).

## Quick start (Docker)

```bash
git clone https://github.com/walaware/tripwala.git
cd tripwala
cp .env.example .env          # set PB_SUPERUSER_PASSWORD
docker compose up --build
```

Open **http://localhost:8080/demo-tripwala-weekend** to see a seeded demo trip.

Caddy deliberately exposes only `/api/files/*` from PocketBase — the REST API and
the `/_/` admin UI are **not** served through it, in any environment. To reach the
admin UI, publish PocketBase's port with the dev override and go straight to it:

```bash
docker compose -f compose.yml -f compose.dev.yml up -d pocketbase
# → http://127.0.0.1:8090/_/   (superuser is auto-created from your .env)
```

In production, tunnel instead: `ssh -L 8090:127.0.0.1:8090 <host>`.

## Tech stack

| Layer    | Choice                                         |
| -------- | ---------------------------------------------- |
| Backend  | [PocketBase](https://pocketbase.io) (single Go binary: SQLite, auth, admin UI) |
| Frontend | [SvelteKit](https://kit.svelte.dev) 2 + Svelte 5 (adapter-node) |
| Styling  | Tailwind CSS v4 + the **Campfire** design system |
| Proxy    | Caddy (single origin)                          |
| Deploy   | Docker Compose · prebuilt images on GHCR       |

## Local development

The default loop runs **`web` natively for hot-module reload**, with PocketBase in
docker — `vite dev` proxies `/api` + `/_` to it, so the browser stays same-origin
(Node 22+ and pnpm required):

```bash
cp .env.example .env
docker compose -f compose.yml -f compose.dev.yml up -d pocketbase
cd web && pnpm install && pnpm dev
# http://localhost:5173/demo-tripwala-weekend
```

tripwala's dev ports are vite **5173** / PocketBase **8090**. Google sign-in needs
`http://localhost:5173/auth/callback` registered in the OAuth client (use
`localhost`, never `127.0.0.1` — Google treats them as different origins). Before a
PR: `pnpm check` and `pnpm build`. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Want more sample data? `cd web && pnpm seed:dev` adds a few varied trips
(confirmed / planning / past) to your signed-in account — or to a
`demo@tripwala.local` / `demotripwala123` login if no one's signed in yet.
It's idempotent, so it's safe to re-run.

To validate the production-parity build, run the full single-origin stack with
`docker compose up --build` (→ the [Quick start](#quick-start-docker) on `:8080`).

## Secrets & configuration

tripwala is configured entirely through environment variables — there's **no hard
dependency on any particular secret manager.** Copy `.env.example` to `.env` and
fill it in however you like:

- **Required:** `PB_SUPERUSER_PASSWORD` — the SvelteKit server authenticates to
  PocketBase as this superuser.
- **Required:** `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — Google
  is the only way to sign in, so leaving these empty locks everyone out.

Manage those values with whatever you prefer — a plain `.env`, a cloud secret
store, or **1Password**. This project happens to use the 1Password CLI (`op`):
`.env.example` ships with `op://…` references, so `op inject -i .env.example -o
.env` (or `op run -- docker compose up`) renders the real values at deploy time.
That's a convenience, not a requirement — `op` is never needed at runtime.

## Deploying (homelab / GHCR)

Pushes to `main` build `tripwala-web` and `tripwala-pocketbase` images and publish them
to GHCR (`.github/workflows/docker.yml`). On your server, pull and run:

```bash
op run -- docker compose -f compose.prod.yml pull
op run -- docker compose -f compose.prod.yml up -d
```

Front the published Caddy port (`:8080`) with your reverse proxy or a Cloudflare
Tunnel pointing `tripwala.<your-domain>` at it. Secrets come from your `.env`
(use `op://` URIs + `op run`). The PocketBase `pb_data` volume holds all state —
back it up.

## How it works

A trip is one page reached at `/{share_token}`. Opening it signed-out shows a
teaser; signing in lets you join. Holders of the legacy
`/{share_token}/edit?owner={owner_token}` link can **claim** the trip to their
account (becoming an organizer) — also how you add co-organizers.

**Data model** (`pocketbase/pb_migrations/`): `users`, `trips`, `participants`,
`gear_items`, `gear_claims`, `meal_slots`, `meal_signups`, `packing_items`.

- Auth is PocketBase-native (`users` collection): **Google OAuth2 only**. There is
  no password login and no reset flow; `pnpm audit:auth` lists accounts with no
  linked Google identity.
- `participants` is the membership table — a participant links to a `user` and a
  `role` (`organizer` | `guest`). `trips.created_by` is the creator.
- Gear "remaining" = `qty_needed − Σ claims`; claiming auto-adds a personal
  packing item linked via `from_gear`.

### Security model

The browser **never talks to PocketBase directly.** Every collection rule is
locked to superuser-only; all access goes through the SvelteKit server: the
signed-in user is hydrated from a `pb_auth` cookie, reads happen in the page
`load()`, and writes go through `POST /[share_token]/actions`. Both require the
user to be a **member** of the trip; the acting participant is derived from the
authenticated user (not trusted from the client), and only organizers may act on
others. This scopes everything to one trip and gates private content to invited,
signed-in guests. **The invite link lets you join; your account is your identity.**

## Roadmap

Captured, not yet built — each needs its own pass:

- **Multi-trip + planner** — now unblocked by accounts: a dashboard + calendar
  where you see every trip you're hosting or invited to, with a smooth **"no
  trips planned yet"** empty state. See the
  [roadmap](https://github.com/walaware/tripwala/blob/main/ROADMAP.md).
- **Carpooling / convoy** — sub-groups (cars) with their own plan until they meet.
- **Native apps** — installable PWA → iOS/Android via Capacitor over the same API.
- **Expenses** — native split & settle-up (Spliit has no public API to reuse).
- **AI touches** — optional, BYO-token, invisible (auto-emoji, suggestions). See
  [`docs/ai-features.md`](./docs/ai-features.md).
- **Programmatic / MCP API** — see [`docs/api-layer.md`](./docs/api-layer.md).

**API access (shipped, scoped):** beyond that future MCP design, tripwala adopts
the walaware [API Access standard](https://github.com/walaware/.github/blob/main/docs/api-access.md)
— a scoped, revocable, **tailnet-only** token surface (curated `/api/x/v1/*`,
never superuser) for programmatic read + narrow writes. See
[`docs/for-api.md`](./docs/for-api.md).

## Built with AI

tripwala is a **heavily AI-developed codebase** — most of the code, docs, and
migrations were written by LLM coding agents under human direction and review.
We disclose this openly; see [AI_POLICY.md](https://github.com/walaware/.github/blob/main/AI_POLICY.md) for what that means
for users and contributors.

## Contributing

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[Code of Conduct](https://github.com/walaware/.github/blob/main/CODE_OF_CONDUCT.md). Keep it invite-first and mobile-first.
AI-assisted contributions are welcome ([AI policy](https://github.com/walaware/.github/blob/main/AI_POLICY.md)) — you're
responsible for testing and understanding what you submit.

## License

[AGPL-3.0](./LICENSE) — free to self-host and modify; if you run a modified
version as a network service, share your changes.
