# Working in tripwala (agents & humans)

tripwala follows the **walaware** org conventions. Don't restate the shared rules
here — read them at the source:

- **[walaware/.github → docs/for-agents.md](https://github.com/walaware/.github/blob/main/docs/for-agents.md)** — start here
- [architecture.md](https://github.com/walaware/.github/blob/main/docs/architecture.md) ·
  [conventions.md](https://github.com/walaware/.github/blob/main/docs/conventions.md) ·
  [DOCUMENTATION.md](https://github.com/walaware/.github/blob/main/DOCUMENTATION.md)

## What's specific to tripwala

- **Core principle:** *one link, private to the people you invite.* Guests sign in
  (Google or email) to join; only members see the trip. Don't break the
  invite-first, members-only model.
- **Local dev (default loop):** run `web` natively for HMR, PocketBase in docker.

  ```bash
  docker compose -f compose.yml -f compose.dev.yml up -d pocketbase
  cd web && pnpm install && pnpm dev      # http://localhost:5173 (HMR)
  ```

  vite proxies `/api` + `/_` to PocketBase, so the browser stays same-origin.
  tripwala's dev ports are vite **5173** / PocketBase **8090**; Google sign-in
  needs `http://localhost:5173/auth/callback` registered (use `localhost`, never
  `127.0.0.1`). `docker compose up --build` (→ **http://localhost:8080**) is the
  production-parity check before a PR — not the iteration loop.
- **Domain lives here; generic UI is shared.** App-specific components in
  `web/src/lib`; primitives come from `@walaware/design` (check its `dist/` for
  exact props — don't re-roll buttons, cards, the wordmark).
- **Verify before claiming done:** `cd web && pnpm check && pnpm build`.

App design docs: [`docs/`](./docs/). Data model + **Security model**: [README](./README.md).
