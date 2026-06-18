<div align="center">

# 🏕️ Rally

**One link where the group gathers.**

A self-hosted web app for coordinating group trips — camping, backpacking, road
trips, cabin weekends. Share one link, no accounts. Everyone RSVPs, claims gear,
signs up for food, and checks off packing — all on the same live page.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Built with SvelteKit](https://img.shields.io/badge/SvelteKit-5-ff3e00.svg)](https://kit.svelte.dev)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.39-b8dbe4.svg)](https://pocketbase.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![AI-developed](https://img.shields.io/badge/built_with-AI_%2B_human_review-7c3aed.svg)](./AI_POLICY.md)

</div>

---

## Why Rally?

Every group trip starts as a Notion page or a group-chat scroll — read-only, dead,
and nobody updates it. Rally is the opposite: **shared, live state behind one
link, with zero login friction.** Open the link on your phone, claim a name, and
you're in.

The killer feature: **gear claims without collisions.** No more three tents and
zero stoves — claim "I'll bring it" and everyone sees it's covered, instantly.

## Features

- 🔗 **One shareable link, no accounts.** A per-trip token in the URL + a
  "claim your name" identity (stored locally). Optional accounts can come later.
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
git clone https://github.com/bigsaam/rally.git
cd rally
cp .env.example .env          # set PB_SUPERUSER_PASSWORD
docker compose up --build
```

Open **http://localhost:8080/demo-rally-weekend** to see a seeded demo trip. The
PocketBase admin UI is at `/_/` (superuser is auto-created from your `.env`).

## Tech stack

| Layer    | Choice                                         |
| -------- | ---------------------------------------------- |
| Backend  | [PocketBase](https://pocketbase.io) (single Go binary: SQLite, auth, admin UI) |
| Frontend | [SvelteKit](https://kit.svelte.dev) 2 + Svelte 5 (adapter-node) |
| Styling  | Tailwind CSS v4 + the **Campfire** design system |
| Proxy    | Caddy (single origin)                          |
| Deploy   | Docker Compose · prebuilt images on GHCR       |

## Local development

Node 22+, pnpm, and the PocketBase binary.

```bash
# 1) PocketBase (migrations + a seed trip auto-apply on first serve)
cd pocketbase
curl -sL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.39.4/pocketbase_0.39.4_$(uname -s | tr A-Z a-z)_$([ "$(uname -m)" = arm64 ] && echo arm64 || echo amd64).zip"
unzip -o pb.zip pocketbase && rm pb.zip
./pocketbase serve --http=127.0.0.1:8090
./pocketbase superuser upsert admin@rally.local rallyadmin123   # in another shell

# 2) Web
cd ../web && pnpm install && pnpm dev
# http://localhost:5173/demo-rally-weekend
```

Vite proxies `/api` and `/_` to PocketBase; the SvelteKit server talks to it
directly. Before a PR: `pnpm check` and `pnpm build`. See
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Deploying (homelab / GHCR)

Pushes to `main` build `rally-web` and `rally-pocketbase` images and publish them
to GHCR (`.github/workflows/docker.yml`). On your server, pull and run:

```bash
op run -- docker compose -f docker-compose.prod.yml pull
op run -- docker compose -f docker-compose.prod.yml up -d
```

Front the published Caddy port (`:8080`) with your reverse proxy or a Cloudflare
Tunnel pointing `rally.<your-domain>` at it. Secrets come from your `.env`
(use `op://` URIs + `op run`). The PocketBase `pb_data` volume holds all state —
back it up.

## How it works

A trip is one page reached at `/{share_token}`. The creator also gets a private
`/{share_token}/edit?owner={owner_token}` link.

**Data model** (`pocketbase/pb_migrations/`): `trips`, `participants`,
`gear_items`, `gear_claims`, `meal_slots`, `meal_signups`, `packing_items`.

- `participants.client_id` — a random UUID in localStorage maps a browser to a
  participant with no password (the no-account trick).
- Gear "remaining" = `qty_needed − Σ claims`; claiming auto-adds a personal
  packing item linked via `from_gear`.

### Security model

The browser **never talks to PocketBase directly.** Every collection rule is
locked to superuser-only; all access goes through the SvelteKit server
(authenticated as a superuser): reads via the page `load()`, writes via
`POST /[share_token]/actions`, which resolves the trip from the URL token and
verifies every target row belongs to it. This scopes everything to one trip and
closes cross-trip read/write/enumeration. Within a trip, identity is claim-based
and trusted — the intended no-account model. **The share link is the secret.**

## Roadmap

Captured, not yet built — each needs its own pass:

- **Multi-trip + planner** — a planner/dashboard + calendar where you see every
  trip you're hosting or invited to, with a smooth **"no trips planned yet"**
  empty state. Today the app is single-trip-per-link; this is the cross-trip
  view. (Implies optional cross-trip accounts — see
  [`docs/api-layer.md`](./docs/api-layer.md).)
- **Carpooling / convoy** — sub-groups (cars) with their own plan until they meet.
- **Native apps** — installable PWA → iOS/Android via Capacitor over the same API.
- **Expenses** — native split & settle-up (Spliit has no public API to reuse).
- **AI touches** — optional, BYO-token, invisible (auto-emoji, suggestions). See
  [`docs/ai-features.md`](./docs/ai-features.md).
- **Programmatic / MCP API** — see [`docs/api-layer.md`](./docs/api-layer.md).

## Built with AI

Rally is a **heavily AI-developed codebase** — most of the code, docs, and
migrations were written by LLM coding agents under human direction and review.
We disclose this openly; see [AI_POLICY.md](./AI_POLICY.md) for what that means
for users and contributors.

## Contributing

PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and the
[Code of Conduct](./CODE_OF_CONDUCT.md). Keep it no-account and mobile-first.
AI-assisted contributions are welcome ([AI policy](./AI_POLICY.md)) — you're
responsible for testing and understanding what you submit.

## License

[AGPL-3.0](./LICENSE) — free to self-host and modify; if you run a modified
version as a network service, share your changes.
