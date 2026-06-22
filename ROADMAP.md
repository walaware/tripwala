# 🧭 Rally — Roadmap

Where Rally is headed. This is a living document; each item links to a tracking
[issue](https://github.com/bigsaam/rally/issues?q=is%3Aissue+label%3Aroadmap),
grouped into [milestones](https://github.com/bigsaam/rally/milestones). Ideas and
discussion live in
[Discussions](https://github.com/bigsaam/rally/discussions).

> Rally is a [heavily AI-developed](./AI_POLICY.md) codebase built under human
> direction. The roadmap is human-owned — these are the things we *want* to
> build, roughly in order. Order and scope will shift.

## Shipped

- One-link, no-account trips at a share URL
- Adopt-by-name identity (claim a name, become existing or new — no dupes)
- RSVP with a "maybe" lean (long shot / 50-50 / leaning yes)
- Gear claims (collision-safe), per-day Meals (owner + helpers), Packing
- Batch-add for gear & packing
- Friendly slugs, trip details/links in header
- Locked-down API — the browser never touches PocketBase; all writes are
  server-mediated and trip-scoped
- "Campfire" design system

---

## v1 · Quick Wins & Polish

Small, no-auth improvements shippable now.

- [ ] [#1 Trip secret / passphrase invite](https://github.com/bigsaam/rally/issues/1) — privacy beyond link-obfuscation
- [ ] [#2 Weather forecast + countdown](https://github.com/bigsaam/rally/issues/2)
- [ ] [#3 Dietary restrictions (feeds Meals)](https://github.com/bigsaam/rally/issues/3)
- [ ] [#4 Emergency info card](https://github.com/bigsaam/rally/issues/4)
- [ ] [#5 Clone / template trips](https://github.com/bigsaam/rally/issues/5)
- [ ] [#6 Add / remove meal slot control](https://github.com/bigsaam/rally/issues/6)
- [ ] [#7 Bump slug entropy + rate limiting](https://github.com/bigsaam/rally/issues/7)

## v2 · Organizer & Post-Trip

Visible organizer role, co-organizing, and the post-trip experience.

- [ ] [#8 Visible organizer role + co-organizers](https://github.com/bigsaam/rally/issues/8) *(epic)*
- [ ] [#9 Post-trip view (auto-switch after end date)](https://github.com/bigsaam/rally/issues/9)
- [ ] [#10 Trip "Wrapped" recap](https://github.com/bigsaam/rally/issues/10)
- [ ] [#11 Check-in / "I've arrived" status](https://github.com/bigsaam/rally/issues/11)

## v3 · Maps & Location

- [ ] [#12 Proper map support for all trip types](https://github.com/bigsaam/rally/issues/12) *(epic)*
- [ ] [#13 Live friend location ("Find My"-style)](https://github.com/bigsaam/rally/issues/13) *(epic · needs native)*

## v4 · Identity & Multi-Trip

The keystone — unlocks the dashboard, real co-organizing, and multi-trip.
Casual attendees keep the no-account "just open the link" path.

- [ ] [#14 Auth / identity / friends system](https://github.com/bigsaam/rally/issues/14) *(epic · keystone)*
- [ ] [#15 Trip dashboard (past / current / upcoming + stats)](https://github.com/bigsaam/rally/issues/15)
- [ ] [#16 Full cross-account co-organizing](https://github.com/bigsaam/rally/issues/16)

## v5 · Collaboration

- [ ] [#17 Polls / voting](https://github.com/bigsaam/rally/issues/17)
- [ ] [#18 Itinerary timeline](https://github.com/bigsaam/rally/issues/18)
- [ ] [#19 Lightweight chat / comments](https://github.com/bigsaam/rally/issues/19)
- [ ] [#20 Web push notifications](https://github.com/bigsaam/rally/issues/20)

## v6 · Media & Integrations

- [ ] [#21 Immich auto-album](https://github.com/bigsaam/rally/issues/21)
- [ ] [#22 Shared photo wall](https://github.com/bigsaam/rally/issues/22)
- [ ] [#23 Collaborative playlist](https://github.com/bigsaam/rally/issues/23)

## Future · Backlog

Larger bets and longer-horizon ideas.

- [ ] [#24 Expenses — native split / settle-up](https://github.com/bigsaam/rally/issues/24) *(epic)*
- [ ] [#25 Carpooling / convoy sub-groups](https://github.com/bigsaam/rally/issues/25)
- [ ] [#26 Native app — PWA → iOS/Android (Capacitor)](https://github.com/bigsaam/rally/issues/26) *(epic · needs native)*
- [ ] [#27 AI features — invisible, BYO-token](https://github.com/bigsaam/rally/issues/27)
- [ ] [#28 MCP / API layer](https://github.com/bigsaam/rally/issues/28) *(epic)*
- [ ] [#29 Activities section vs gear](https://github.com/bigsaam/rally/issues/29)

---

## Dependency notes

- **Identity is the hinge.** [#14](https://github.com/bigsaam/rally/issues/14)
  gates the dashboard ([#15](https://github.com/bigsaam/rally/issues/15)) and
  full co-organizing ([#16](https://github.com/bigsaam/rally/issues/16)).
- **Native unlocks location.** Live friend location
  ([#13](https://github.com/bigsaam/rally/issues/13)) needs the native/PWA app
  ([#26](https://github.com/bigsaam/rally/issues/26)) for reliable background
  location.
- **Privacy pairs up.** The trip secret
  ([#1](https://github.com/bigsaam/rally/issues/1)) and slug entropy
  ([#7](https://github.com/bigsaam/rally/issues/7)) are best done together.

Want to suggest or upvote something? Open a
[Discussion](https://github.com/bigsaam/rally/discussions) or an
[issue](https://github.com/bigsaam/rally/issues/new).
