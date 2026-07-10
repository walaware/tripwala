# 🧭 tripwala — Roadmap

Where tripwala is headed. This is a living document; each item links to a tracking
[issue](https://github.com/walaware/tripwala/issues?q=is%3Aissue+label%3Aroadmap),
grouped into [milestones](https://github.com/walaware/tripwala/milestones). Ideas and
discussion live in
[Discussions](https://github.com/walaware/tripwala/discussions).

> tripwala is a [heavily AI-developed](https://github.com/walaware/.github/blob/main/AI_POLICY.md) codebase built under human
> direction. The roadmap is human-owned — these are the things we *want* to
> build, roughly in order. Order and scope will shift (e.g. accounts landed
> ahead of the v1–v3 polish once we decided privacy needed real identity).

## Shipped

- **Planning phase** — start a trip as an idea: gather availability (proposed
  ranges + a free-pick calendar heatmap) and location ideas (suggest + upvote),
  then the owner confirms it into a real trip
- **Rich location cards** — location ideas render as a horizontal card row with
  self-hosted, SSRF-guarded link previews (OpenGraph unfurl), drag-drop/upload
  images, and the picked spot's image carried into the confirmed trip
- **Trip map** — a first-class Leaflet + OpenStreetMap map (no API key) with
  pins for campsite, meetup, parking, trailheads, gas, etc.; add by searching a
  place (server-proxied geocoding) or tapping the map. Works for any trip type
- **Itinerary + voting** — a day-by-day plan where any item can carry suggested
  options the crew votes on (one pick per person, live tallies) and an organizer
  locks in the winner; undated "to decide" items are free-form group polls — so
  "where do we eat" lives in the plan, not a separate poll module
- **Coordination & lifecycle polish** _(v1 + v2 complete)_ — editable meal slots,
  per-person dietary notes (shown to cooks), a trip-dates weather forecast + live
  countdown, an emergency/safety info card, live arrival check-in, one-tap trip
  cloning, and an auto post-trip "Wrapped" recap once the dates pass
- One invite link per trip; **accounts** (Google OAuth2) — sign in to join, and
  only invited members see the details (non-members get a teaser)
- **Membership + roles** — organizer / guest; creator is auto-organizer;
  membership-gated, server-mediated writes; invite co-organizers by email (they
  join straight as an organizer)
- **Participant claim/merge** — sign in and claim your pre-auth name (no dupes)
- **Multi-trip dashboard** — your trips bucketed Happening now / Upcoming / Past
  with counts, organizer badges, and a "no trips yet" empty state
- Adopt-by-name identity, RSVP with a "maybe" lean, collision-safe gear claims,
  per-day Meals (owner + helpers), Packing, batch-add
- 3-word invite slugs (~19 bits) + in-memory rate limiting
- Locked-down API (browser never touches PocketBase), "Campfire" design system,
  responsive desktop/mobile

---

## v1 · Quick Wins & Polish

- [x] [#31 Planning phase — gather dates & location before a trip is real](https://github.com/walaware/tripwala/issues/31) ✅
- [x] [#32 Rich location cards — link previews, custom images, confirmed hero](https://github.com/walaware/tripwala/issues/32) ✅
- [x] ~~#1 Trip secret / passphrase invite~~ — dropped; superseded by accounts
- [x] [#2 Weather forecast + countdown](https://github.com/walaware/tripwala/issues/2) ✅
- [x] [#3 Dietary restrictions (feeds Meals)](https://github.com/walaware/tripwala/issues/3) ✅
- [x] [#4 Emergency info card](https://github.com/walaware/tripwala/issues/4) ✅
- [x] [#5 Clone / template trips](https://github.com/walaware/tripwala/issues/5) ✅
- [x] [#6 Add / remove meal slot control](https://github.com/walaware/tripwala/issues/6) ✅
- [x] [#7 3-word slugs + rate limiting](https://github.com/walaware/tripwala/issues/7) ✅

## v2 · Organizer & Post-Trip

- [x] [#8 Visible organizer role + co-organizers](https://github.com/walaware/tripwala/issues/8) ✅
- [x] [#9 Post-trip view (auto-switch after end date)](https://github.com/walaware/tripwala/issues/9) ✅
- [x] [#10 Trip "Wrapped" recap](https://github.com/walaware/tripwala/issues/10) ✅
- [x] [#11 Check-in / "I've arrived" status](https://github.com/walaware/tripwala/issues/11) ✅

## v3 · Maps & Location

- [x] [#12 Proper map support for all trip types](https://github.com/walaware/tripwala/issues/12) ✅ — Leaflet + OSM map; search-or-tap pins (campsite, meetup, parking, trailhead, …) per trip
- [ ] [#13 Live friend location ("Find My"-style)](https://github.com/walaware/tripwala/issues/13) *(epic · blocked on native — see [#26](https://github.com/walaware/tripwala/issues/26))*

## v4 · Identity & Multi-Trip

- [x] [#14 Auth / identity system](https://github.com/walaware/tripwala/issues/14) ✅ *(keystone)*
- [x] [#15 Trip dashboard (past / current / upcoming + stats)](https://github.com/walaware/tripwala/issues/15) ✅
- [x] [#16 Invite a co-organizer by account/email](https://github.com/walaware/tripwala/issues/16) ✅

## v5 · Collaboration

- [x] [#18 Itinerary timeline](https://github.com/walaware/tripwala/issues/18) ✅ — day-by-day plan; each item can carry suggested options the crew votes on, with a locked-in "✓ Plan" winner
- [x] [#17 Polls / voting](https://github.com/walaware/tripwala/issues/17) ✅ — folded into the itinerary rather than a separate module: dated items vote on choices ("where do we eat"), and undated "to decide" items are free-form group polls. Date/destination voting already lived in the planning phase
- [ ] [#19 Lightweight chat / comments](https://github.com/walaware/tripwala/issues/19)
- [ ] [#20 Web push notifications](https://github.com/walaware/tripwala/issues/20)

## v6 · Media & Integrations

- [ ] [#21 Immich album — opt-in per trip](https://github.com/walaware/tripwala/issues/21) — user chooses to create a shared album (at trip creation and/or in settings); **never auto-created**. Named by convention "Type - Trip Name" and kept in sync when the trip is renamed/retyped; embed the shared link.
- [ ] [#22 Shared photo wall](https://github.com/walaware/tripwala/issues/22)
- [ ] [#23 Collaborative playlist](https://github.com/walaware/tripwala/issues/23)

## Future · Backlog

- [ ] [#24 Expenses — native split / settle-up](https://github.com/walaware/tripwala/issues/24) *(epic)*
- [ ] [#25 Carpooling / convoy sub-groups](https://github.com/walaware/tripwala/issues/25)
- [ ] [#26 Native app — PWA → iOS/Android (Capacitor)](https://github.com/walaware/tripwala/issues/26) *(epic · needs native)*
- [ ] [#27 AI features — invisible, BYO-token](https://github.com/walaware/tripwala/issues/27)
- [ ] [#28 MCP / API layer](https://github.com/walaware/tripwala/issues/28) *(epic)*
- [ ] [#29 Activities section vs gear](https://github.com/walaware/tripwala/issues/29)
- [x] ~~[#30 Friend graph — invite-by-friend](https://github.com/walaware/tripwala/issues/30)~~ — friendships + invite-friends-to-trips + friends-on-calendar ✅

---

## Notes

- **Accounts are the foundation** ([#14](https://github.com/walaware/tripwala/issues/14),
  shipped) — they unlocked the dashboard ([#15](https://github.com/walaware/tripwala/issues/15)),
  co-organizing, and gating private content to invited members. Casual attendees
  still just open the link and sign in.
- **Native unlocks location.** Live friend location
  ([#13](https://github.com/walaware/tripwala/issues/13)) needs the native/PWA app
  ([#26](https://github.com/walaware/tripwala/issues/26)) for reliable background
  location.

Want to suggest or upvote something? Open a
[Discussion](https://github.com/walaware/tripwala/discussions) or an
[issue](https://github.com/walaware/tripwala/issues/new).
