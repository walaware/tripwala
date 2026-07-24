<script>
  import { Button, OverflowMenu, AvatarGroup } from '@walaware/design';
  import { tripHeroSrc, heroIsPhoto } from '$lib/tripHero.js';
  import { heroBannerSrc } from '$lib/heroDefaults.js';
  import { fmtDateRange, tripLength } from '$lib/format.js';

  /**
   * The trip's "cover hero": the artwork with the trip name, dates and crew faces
   * overlaid (a cinematic cover), replacing the old TripBanner + TripHeader stack.
   *
   * Architecture (blessed by the design agent against AppShell v0.12.0 — no shared
   * component / shell change needed):
   *   • the cover is NON-sticky and scrolls away — it holds the ONE real <h1>.
   *   • a slim `[data-appshell-sticky]` "echo" bar is the sticky chrome: empty at
   *     rest, it reveals a presentational title-echo + ＋Add once the cover has
   *     scrolled under it. AppShell owns the scrollspy offset (auto-measures this
   *     bar) and, on MOBILE, the collapse into the top bar (it forces this element
   *     `position: static`, so the reveal below is DESKTOP-only — the shell
   *     crossfades the mobile top bar from the title/subtitle/icon props instead).
   *   • desktop stuck-detection is a local IntersectionObserver on a sentinel,
   *     scoped to the AppShell scroll root (`main.content`) — it never overlaps the
   *     shell's own mobile observer.
   *
   * @type {{
   *   trip: { name: string, start_date?: string, end_date?: string, location?: string, heroImage?: string, trip_type?: string | null, pickedLocation?: any },
   *   emoji: string,
   *   participants: Array<{ display_name: string, avatar?: string }>,
   *   isPast?: boolean,
   *   addActions: Array<{ icon?: string, label: string, onClick?: () => void }>
   * }}
   */
  let { trip, emoji, participants = [], isPast = false, addActions } = $props();

  const src = $derived(tripHeroSrc(trip, heroBannerSrc(trip?.trip_type)));
  const isPhoto = $derived(heroIsPhoto(trip));
  const range = $derived(trip.start_date ? fmtDateRange(trip.start_date, trip.end_date) : '');
  const nights = $derived(tripLength(trip.start_date, trip.end_date).nights);
  // Faces stand in for the crew count — killing the "N going" repeat that also
  // lives in the CREW stat tile and the "Who's coming?" card.
  const faces = $derived(
    participants.slice(0, 6).map((p) => ({ name: p.display_name, src: p.avatar || undefined }))
  );

  // Desktop-only stuck reveal (mobile is the shell's job — see header comment).
  let desktop = $state(true);
  $effect(() => {
    const mq = window.matchMedia('(min-width: 920px)');
    const update = () => (desktop = mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  /** @type {HTMLElement | undefined} */
  let sentinel = $state();
  let stuck = $state(false);
  $effect(() => {
    if (!sentinel) return;
    // Scope to the AppShell scroll root so the observer fires on in-container
    // scroll (the app scrolls `main.content`, not the window). Fall back to the
    // viewport if the shell markup ever changes.
    const root = sentinel.closest('main.content') ?? null;
    const io = new IntersectionObserver(([e]) => (stuck = !e.isIntersecting), { root, threshold: 0 });
    io.observe(sentinel);
    return () => io.disconnect();
  });

  const revealed = $derived(desktop && stuck);
</script>

<div class="cover" data-cover={isPhoto ? 'photo' : 'art'} class:past={isPast}>
  {#if src}
    <img class="cover-img" {src} alt="" loading="eager" decoding="async" />
  {/if}
  <div class="cover-scrim"></div>

  <div class="cover-add">
    {#if isPast}
      <span class="wrapped">🎉 Wrapped</span>
    {:else}
      <OverflowMenu actions={addActions} label="Add to this trip" align="end">
        {#snippet trigger({ toggle })}
          <Button variant="primary" size="sm" onclick={toggle}>＋ Add</Button>
        {/snippet}
      </OverflowMenu>
    {/if}
  </div>

  <div class="cover-body">
    <h1 class="cover-title">{trip.name}</h1>
    <div class="cover-meta">
      {#if range}<span>{range}</span>{/if}
      {#if nights > 0}<span class="dot">·</span><span>{nights} night{nights === 1 ? '' : 's'}</span>{/if}
      {#if trip.location}<span class="dot">·</span><span class="loc">{trip.location}</span>{/if}
    </div>
    {#if faces.length}
      <div class="cover-faces">
        <AvatarGroup people={faces} size={26} max={6} />
        {#if isPast}<span class="faces-label">who went</span>{/if}
      </div>
    {/if}
  </div>
</div>

<!-- Sentinel at the cover's base: once it leaves the scroll root's top, the echo
     is "stuck" (desktop). -->
<div bind:this={sentinel} class="cover-sentinel" aria-hidden="true"></div>

<!-- Slim sticky echo. `margin-top: -height` tucks it under the cover's base at
     rest (zero footprint, no gap); it reveals only once stuck. -->
<header data-appshell-sticky class="echo" class:revealed>
  <span class="echo-id" aria-hidden="true">
    <span class="echo-emoji">{emoji}</span>
    <span class="echo-name">{trip.name}</span>
  </span>
  {#if !isPast}
    <OverflowMenu actions={addActions} label="Add to this trip" align="end">
      {#snippet trigger({ toggle })}
        <Button variant="primary" size="sm" onclick={toggle}>＋ Add</Button>
      {/snippet}
    </OverflowMenu>
  {/if}
</header>

<style>
  .cover {
    position: relative;
    height: 176px;
    overflow: hidden;
    border-radius: var(--radius-lg, 14px);
    background: var(--color-sand-200);
  }
  @media (min-width: 640px) {
    .cover {
      height: 196px;
    }
  }
  .cover-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Anchor to the top so the trimmed slack comes off the base — the fade covers
       it — rather than the silhouettes' peaks. */
    object-position: center top;
  }

  /* Legibility. ART (generated pastel) is light, so we lean on a fade to the app
     background at the base and place DARK text there. A PHOTO is unpredictable, so
     it gets a real dark scrim and light text — never trust the image for contrast. */
  .cover-scrim {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .cover[data-cover='art'] .cover-scrim {
    background: linear-gradient(
      to bottom,
      transparent 0%,
      color-mix(in srgb, var(--color-bg-app) 30%, transparent) 42%,
      color-mix(in srgb, var(--color-bg-app) 78%, transparent) 70%,
      var(--color-bg-app) 100%
    );
  }
  .cover[data-cover='photo'] .cover-scrim {
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--color-cocoa-900) 8%, transparent) 0%,
      transparent 30%,
      color-mix(in srgb, var(--color-cocoa-900) 45%, transparent) 72%,
      color-mix(in srgb, var(--color-cocoa-900) 72%, transparent) 100%
    );
  }
  .cover.past .cover-img {
    filter: saturate(0.55);
  }

  .cover-add {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 2;
  }
  .wrapped {
    display: inline-block;
    border-radius: 999px;
    background: var(--color-berry-200);
    padding: 5px 12px;
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 800;
    color: var(--color-berry-600);
  }

  .cover-body {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 12px;
    z-index: 1;
  }
  .cover-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 26px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  @media (min-width: 640px) {
    .cover-title {
      font-size: 30px;
    }
  }
  .cover-meta {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    font-family: var(--font-body);
    font-size: 13.5px;
    font-weight: 800;
  }
  .cover-meta .dot {
    opacity: 0.5;
  }
  .cover-faces {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .faces-label {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 800;
    opacity: 0.75;
  }

  /* ART: dark text on the faded-to-bg base. */
  .cover[data-cover='art'] .cover-title {
    color: var(--color-text-strong);
  }
  .cover[data-cover='art'] .cover-meta {
    color: var(--color-coral-600);
  }
  .cover[data-cover='art'] .cover-meta .loc {
    color: var(--color-text-muted);
  }
  /* PHOTO: light text + soft shadow over the dark scrim. */
  .cover[data-cover='photo'] .cover-title {
    color: #fff;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45);
  }
  .cover[data-cover='photo'] .cover-meta {
    color: rgba(255, 255, 255, 0.94);
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  }

  .cover-sentinel {
    height: 1px;
  }

  /* Slim sticky echo — pulled up under the cover base so it costs no space at
     rest; reveals (desktop) once the cover scrolls under. On mobile the shell
     forces this `position: static`, so it just scrolls away and the top bar takes
     over — the reveal below never engages (gated on `desktop`). */
  .echo {
    position: sticky;
    top: 0;
    z-index: 5;
    margin-top: -52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 52px;
    padding: 0 2px;
    background: var(--color-bg-app);
    opacity: 0;
    transform: translateY(-4px);
    pointer-events: none;
  }
  .echo.revealed {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
    border-bottom: 1px solid var(--color-sand-300);
    box-shadow: 0 var(--stack-gap, 14px) 0 var(--color-bg-app);
  }
  .echo-id {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .echo-emoji {
    flex: none;
    display: grid;
    place-items: center;
    height: 30px;
    width: 30px;
    border-radius: 8px;
    font-size: 17px;
    background: linear-gradient(135deg, var(--color-sand-200), var(--color-sand-300));
  }
  .echo-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 17px;
    font-weight: 700;
    color: var(--color-text-strong);
  }

  @media (prefers-reduced-motion: no-preference) {
    .echo {
      transition: opacity 160ms ease, transform 160ms ease;
    }
  }
</style>
