# Benefit-aware stays — the moneywala "Card benefits" panel

tripwala is the first consumer of moneywala's programmatic API (moneywala
charter step 7). On a trip's **stay** bookings, members can ask: *given these
dates, this booking channel, and this paying card — what credits fire, what
conflicts, and what does it really cost?* moneywala's deterministic advisor
answers; tripwala only renders.

## How it works

```
BookingsSection (stay rows) ── "💳 Card benefits" ──▶ BenefitsCheck.svelte
        │  GET/POST /[share_token]/benefits (members-only, rate-limited)
        ▼
$lib/server/moneywala.js ── tailnet /api/x/v1 ──▶ moneywala
   (scoped service token: benefits:read + advisor:read)
```

- **`$lib/server/moneywala.js`** — the only place that talks to moneywala.
  Raw `Authorization: <token>` (no Bearer), 8s timeout, walaware API Access
  standard. The token **never reaches the browser**.
- **`/[share_token]/benefits`** (`+server.js`) — members-only, same guard as
  the geocode proxy (card data isn't for view-only share-link holders).
  `GET` returns the paying-card picker (dedup'd from `GET /benefits`) plus the
  live booking-channel values from `GET /channels`. `POST` validates the form
  (`parseEvaluateRequest`), relays to `POST /evaluate-booking`, and returns
  the shaped view model (`shapeEvaluation`).
- **`$lib/benefits.js`** — pure, client-safe shaping + validation, unit-tested
  (`benefits.test.js`).

## Contract points that are easy to get wrong

- **Channels are household data, not an enum.** A rule's `booking_channel` is
  free text; gate matching is exact after trim+lowercase, and an *empty* rule
  channel means any channel passes. The picker is **discovery-driven** from
  `GET /channels` (added to v1 for us, 2026-09-16) and must never hardcode
  values. Sending no channel = "booked direct / somewhere no credit cares
  about" — it passes only open-channel rules, which is the point.
- **Quotes are manual inputs, never scraped** (moneywala charter pricing-risk
  tiers). The cash-quote field is the user pasting a price; moneywala owns the
  math (integer cents).
- **Read-only by design.** Our token has no `benefits:write`; reserve/confirm
  stays in moneywala's UI. If the UX ever needs it, request the scope from the
  moneywala agent — extend v1, don't work around it.
- **Enhancement, not a dependency.** No `MONEYWALA_API_*` env → the panel is
  hidden (`benefitsEnabled` flag from the trip page load). API unreachable
  (e.g. off-tailnet) → a soft "will be back" note. Trips work fine either way.

## Config

`MONEYWALA_API_URL` + `MONEYWALA_API_TOKEN` in `.env` (see `.env.example`);
threaded through `compose.yml` / `compose.prod.yml` into the `web` service.
The prod web container must be able to reach the tailnet URL.
