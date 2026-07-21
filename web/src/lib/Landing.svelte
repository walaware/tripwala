<script>
  import { Button, Wordmark, AppIcon } from '@walaware/design';
  import { WALA_SUITE } from '@walaware/design';

  // Signed-out marketing landing (design spec: docs/apps/tripwala.md →
  // "Landing page — signed-out marketing"). Composes shipped v0.12.0 primitives
  // (AppIcon · Wordmark · Button) + semantic theme tokens under data-app="tripwala"
  // so coral resolves. This is a marketing surface, not an AppShell app screen.

  // "Start a trip" needs a signed-in user (the /new flow redirects to /login when
  // logged out), so both hero + CTA-band buttons route through login and land the
  // visitor straight in the new-trip flow. "Log in" goes to the plain login.
  const START_HREF = '/login?next=/new';
  const LOGIN_HREF = '/login';

  // Six trip modules → a tinted tile borrowing another suite app's soft accent as
  // its category colour, a house-question title, and one line. (RSVP · packing ·
  // food · expenses · map · chat.)
  const features = [
    { emoji: '🙌', bg: 'var(--acc-folk-soft)', title: "Who's coming?", line: 'RSVP with a tap — see who’s in, who’s a maybe, and who quietly flaked.' },
    { emoji: '⛺', bg: 'var(--acc-stuff-soft)', title: 'Who brings the tent?', line: 'Claim the gear up front so nobody packs three stoves and zero tents.' },
    { emoji: '🍳', bg: 'var(--acc-health-soft)', title: "What’s for dinner?", line: 'Sign up for meals and sides — dinner sorts itself out before you leave.' },
    { emoji: '💸', bg: 'var(--acc-money-soft)', title: 'Who owes who?', line: 'Log the shared costs; we do the math on who settles up with whom.' },
    { emoji: '🗺️', bg: 'var(--acc-task-soft)', title: 'How do we get there?', line: 'Drop pins and routes so the whole crew lands in the same place.' },
    { emoji: '💬', bg: 'var(--acc-shop-soft)', title: 'One thread on topic', line: 'Trip chat that stays on the trip — not lost three days up the group chat.' }
  ];

  // Three coral-badge steps for "How it works".
  const steps = [
    { title: 'Make the trip page', line: 'Name it, pick rough dates, and choose the bits this trip actually needs.' },
    { title: 'Share the link', line: 'Drop it in the group chat. No apps to install, no sign-ups to nag about.' },
    { title: 'Watch it sort itself', line: 'People RSVP, claim gear, and pitch in — the plan fills in on its own.' }
  ];

  // The wala family strip — every suite app, newest brand order.
  const suite = Object.entries(WALA_SUITE).map(([app, meta]) => ({
    app: /** @type {keyof typeof WALA_SUITE} */ (app),
    ...meta
  }));
</script>

<div data-app="tripwala" class="min-h-dvh bg-bg-app font-body text-text-body">
  <!-- 1 · Sticky translucent nav ------------------------------------------- -->
  <header class="sticky top-0 z-30 border-b border-sand-300 bg-sand-100/80 backdrop-blur-md">
    <nav class="mx-auto flex h-[62px] max-w-[1120px] items-center gap-3 px-5 sm:px-8">
      <a href="/" class="flex items-center gap-2.5" aria-label="tripwala home">
        <AppIcon app="tripwala" size={34} shadow />
        <Wordmark root="trip" size={22} />
      </a>
      <div class="ml-auto flex items-center gap-1 sm:gap-2">
        <a href="#features" class="nav-link rounded-pill px-3 py-2 font-display text-[14px] font-semibold text-text-muted transition-colors hover:text-text-strong">What it does</a>
        <a href="#how" class="nav-link rounded-pill px-3 py-2 font-display text-[14px] font-semibold text-text-muted transition-colors hover:text-text-strong">How it works</a>
        <Button href={LOGIN_HREF} variant="secondary" size="sm">Log in</Button>
      </div>
    </nav>
  </header>

  <main class="mx-auto max-w-[1120px] px-5 sm:px-8">
    <!-- 2 · Hero ------------------------------------------------------------ -->
    <section class="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
      <div class="text-center lg:text-left">
        <span class="inline-flex items-center rounded-pill bg-primary-soft px-3.5 py-1.5 font-display text-[13px] font-bold text-coral-700">
          🎒 group trips, not group-chat chaos
        </span>
        <h1 class="mt-5 font-display text-[40px] font-bold leading-[1.05] tracking-tight text-text-strong sm:text-[54px]">
          So… where are<br class="hidden sm:block" /> we going?
        </h1>
        <p class="mx-auto mt-5 max-w-xl font-body text-[17px] font-medium leading-relaxed text-text-body sm:text-[19px] lg:mx-0">
          tripwala is the one link where your crew actually plans the trip — RSVPs,
          gear, food, who-owes-who and the route, all in one place instead of buried
          in the group chat.
        </p>
        <div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
          <Button href={START_HREF} variant="primary" size="lg" full class="sm:w-auto">Start a trip 🙌</Button>
          <Button href="#how" variant="soft" size="lg" full class="sm:w-auto">See how</Button>
        </div>
        <p class="mt-4 font-body text-[13.5px] font-bold text-text-muted">
          Free for you and your crew · works on any phone
        </p>
      </div>

      <!-- phone mockup (cocoa bezel, coral glow) framing the 9:19 screenshot slot -->
      <div class="flex justify-center lg:justify-end">
        <div
          class="w-[248px] rounded-[2.6rem] bg-cocoa-900 p-2.5 sm:w-[276px]"
          style="box-shadow: 0 34px 70px -24px rgba(255,122,89,.55), 0 12px 28px -18px rgba(58,45,40,.5);"
        >
          <!-- Screenshot slot — a tasteful placeholder until a real, accurate
               trip-page capture exists (don't ship an inaccurate screenshot). -->
          <div class="aspect-[9/19] overflow-hidden rounded-[2rem] bg-gradient-to-b from-sand-100 to-sand-200">
            <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <AppIcon app="tripwala" size={46} shadow />
              <p class="font-display text-[14px] font-bold text-text-muted">Your whole trip, one scroll</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3 · Feature grid --------------------------------------------------- -->
    <section id="features" class="scroll-mt-24 py-6 sm:py-10">
      <h2 class="text-center font-display text-[28px] font-bold tracking-tight text-text-strong sm:text-[34px]">
        Everything a trip actually needs
      </h2>
      <p class="mx-auto mt-2 max-w-md text-center font-body text-[15.5px] font-medium text-text-muted">
        The bits that always end up scattered across texts, notes and receipts.
      </p>
      <div class="mt-9 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
        {#each features as f (f.title)}
          <div class="rounded-lg bg-surface-card p-5 shadow-card">
            <div class="flex h-12 w-12 items-center justify-center rounded-xl text-[24px]" style="background: {f.bg};">
              {f.emoji}
            </div>
            <h3 class="mt-4 font-display text-[18px] font-bold text-text-strong">{f.title}</h3>
            <p class="mt-1.5 font-body text-[14.5px] font-medium leading-relaxed text-text-muted">{f.line}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- 4 · Wide screenshot band (16:8.5) ---------------------------------- -->
    <section class="py-8 sm:py-12">
      <div class="overflow-hidden rounded-xl border border-sand-300 shadow-card">
        <div class="relative aspect-[16/8.5] bg-gradient-to-br from-sand-100 to-sand-200">
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <AppIcon app="tripwala" size={52} shadow />
            <p class="max-w-sm px-6 font-display text-[16px] font-bold text-text-muted">
              One scrollable trip page — crew, itinerary, packing and costs, side by side.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 5 · How it works --------------------------------------------------- -->
    <section id="how" class="scroll-mt-24 py-10 sm:py-14">
      <h2 class="text-center font-display text-[28px] font-bold tracking-tight text-text-strong sm:text-[34px]">
        Three steps and you’re camping
      </h2>
      <div class="mt-9 grid gap-4 sm:grid-cols-3">
        {#each steps as step, i (step.title)}
          <div class="rounded-lg bg-surface-card p-6 shadow-card">
            <div class="flex h-11 w-11 items-center justify-center rounded-pill bg-primary font-display text-[18px] font-bold text-white">
              {i + 1}
            </div>
            <h3 class="mt-4 font-display text-[18px] font-bold text-text-strong">{step.title}</h3>
            <p class="mt-1.5 font-body text-[14.5px] font-medium leading-relaxed text-text-muted">{step.line}</p>
          </div>
        {/each}
      </div>
    </section>

    <!-- 6 · CTA band ------------------------------------------------------- -->
    <section class="py-8 sm:py-12">
      <div class="rounded-xl bg-primary px-6 py-14 text-center sm:px-10 sm:py-16">
        <h2 class="font-display text-[28px] font-bold leading-tight tracking-tight text-white sm:text-[36px]">
          Your next trip starts with <span class="whitespace-nowrap">a link 🔥</span>
        </h2>
        <p class="mx-auto mt-3 max-w-md font-body text-[16px] font-medium text-white/85">
          Make the page, share it, and let everyone pile in.
        </p>
        <div class="mt-7 flex justify-center">
          <Button href={START_HREF} variant="secondary" size="lg">Start a trip — it’s free</Button>
        </div>
      </div>
    </section>
  </main>

  <!-- 7 · Footer — wala family strip ------------------------------------- -->
  <footer class="border-t border-sand-300 bg-sand-100">
    <div class="mx-auto max-w-[1120px] px-5 py-12 text-center sm:px-8">
      <p class="font-display text-[13px] font-bold uppercase tracking-wider text-text-muted">One of the</p>
      <div class="mt-2 flex items-center justify-center gap-2.5">
        <Wordmark root="wala" suffix="ware" showDot={false} size={22} />
      </div>
      <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
        {#each suite as s (s.app)}
          <span title={`${s.app} — ${s.label}`} class="transition-transform hover:-translate-y-0.5">
            <AppIcon app={s.app} size={38} shadow />
          </span>
        {/each}
      </div>

      <div class="mt-9 flex flex-col items-center gap-1.5">
        <Wordmark root="trip" size={20} />
        <p class="font-body text-[13.5px] font-medium text-text-muted">
          🏠 Prefer your own server? You can self-host tripwala.
        </p>
      </div>

      <p class="mt-8 font-body text-[13px] font-bold text-text-muted">made with ❤️ for people who travel together</p>
    </div>
  </footer>
</div>

<style>
  /* Narrow nav (≤640px) = just the logo lockup + "Log in"; the anchor links
     would crowd/wrap, and the sections stay reachable by scroll. Scoped CSS
     media query, not a JS window-width listener. */
  @media (max-width: 640px) {
    .nav-link {
      display: none;
    }
  }
</style>
