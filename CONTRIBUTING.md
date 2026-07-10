# Contributing to tripwala

tripwala follows the **[walaware contributing guide](https://github.com/walaware/.github/blob/main/CONTRIBUTING.md)** —
read that first for the shared ground rules (be kind, AI-assisted work is welcome,
small focused PRs, migrations are the source of truth, writes go through the
server, `pnpm check` + `pnpm build` before a PR). This page only adds what's
specific to tripwala.

## tripwala's core principle

**One link, private to the people you invite.** Guests sign in (Google or email)
to join, and only members see the trip — features must preserve that
shared-link, members-only model.

**Mobile-first.** Most people open trip links on a phone. Design for that, let it
scale up.

## Getting set up

The default loop runs **`web` natively for hot-reload** with PocketBase in docker
(see the org [conventions](https://github.com/walaware/.github/blob/main/docs/conventions.md#local-development)):

```bash
cp .env.example .env          # set PB_SUPERUSER_PASSWORD
docker compose -f compose.yml -f compose.dev.yml up -d pocketbase
cd web && pnpm install && pnpm dev      # http://localhost:5173/demo-tripwala-weekend
```

vite proxies `/api` + `/_` to PocketBase, so the browser stays same-origin.
tripwala's dev ports are vite **5173** / PocketBase **8090**; Google sign-in needs
`http://localhost:5173/auth/callback` registered in the OAuth client (use
`localhost`, never `127.0.0.1`). Want sample data? `cd web && pnpm seed:dev`
(idempotent).

To validate the production-parity build, run the full single-origin stack:
`docker compose up --build` → **http://localhost:8080**. Caddy serves only
`/api/files/*` from PocketBase, so the admin UI is *not* reachable at `/_/` —
use `http://127.0.0.1:8090/_/` via the `compose.dev.yml` override.

## Reporting bugs / requesting features

Open an issue using the templates — for features, tell us the *use case*. tripwala
grows from real trips.
