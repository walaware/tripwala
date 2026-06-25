<script>
  import '../app.css';
  import { AppShell } from '@walaware/design';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { createShell } from '$lib/shell.svelte.js';

  /** @type {{ children: import('svelte').Snippet, data: import('./$types').LayoutData }} */
  let { children, data } = $props();

  const user = $derived(data.user);
  const path = $derived(page.url.pathname);
  // The trip currently in view, if any — settings is a per-trip surface.
  const tripToken = $derived(page.params.share_token ?? null);

  // Shell holder: an open trip publishes its section nav + title here (see
  // TripView), flipping the AppShell into contextual mode. Null = app level.
  const shell = createShell();
  const inTrip = $derived(shell.trip != null);

  // App-level destinations (design repo → docs/apps/tripwala.md): Trips is the
  // only live one; Calendar · Planner · Map are dimmed `soon` roadmap rows. Trips
  // stays active while a trip is open (it opens as a contextual section nav).
  const appNav = $derived([
    {
      key: 'trips',
      label: 'Trips',
      icon: '🧭',
      active: path === '/' || path === '/new' || tripToken != null,
      href: '/'
    },
    { key: 'calendar', label: 'Calendar', icon: '📅', soon: true },
    { key: 'planner', label: 'Planner', icon: '🗓️', soon: true },
    { key: 'map', label: 'Map', icon: '🗺️', soon: true }
  ]);

  // Contextual mode swaps the global destinations for the open trip's section
  // nav (in-page anchors, driven by scrollSpy) and adds a "← All trips" exit.
  const nav = $derived(shell.trip ? shell.trip.nav : appNav);
  const back = $derived(inTrip ? { label: 'All trips', onClick: () => goto('/') } : null);
  const title = $derived(shell.trip ? shell.trip.title : null);

  // Always-available desktop sidebar (AppShell default): sidebar ≥ 920px, top-bar
  // + drawer below. The soon rows give the app-level sidebar real substance.
  const breakpoint = 920;

  // Sign-out is a POST action; the account button submits the hidden form below.
  /** @type {HTMLFormElement | undefined} */
  let logoutForm = $state();
  const account = $derived(
    user
      ? {
          name: user.name || user.email,
          avatar: user.avatar || undefined, // resolved photo URL (Google CDN or /api/files/…); falls back to initial
          // The shell account avatar (sidebar + mobile top bar) opens the profile
          // editor — available everywhere, not just the dashboard.
          onProfile: () => goto('/profile'),
          onSignOut: () => logoutForm?.requestSubmit()
        }
      : null
  );

  // Settings live INLINE as the trip page's "Trip settings" section (a nav row in
  // contextual mode). The shell's separate Settings gear is only for the standalone
  // /settings route (planning trips not yet on the contextual shell). The account /
  // profile surface is reached via the avatar's onProfile, not this gear.
  const onSettings = $derived(
    !inTrip && tripToken ? () => goto(`/${tripToken}/settings`) : null
  );
  const settingsActive = $derived(path.endsWith('/settings'));
</script>

{#if user}
  <AppShell
    app="tripwala"
    {nav}
    {account}
    {onSettings}
    {settingsActive}
    {back}
    {title}
    scrollSpy={inTrip}
    {breakpoint}
  >
    {@render children()}
  </AppShell>
  <form bind:this={logoutForm} method="POST" action="/logout" class="hidden"></form>
{:else}
  <!-- Logged-out / auth pages bring their own full-bleed chrome. -->
  {@render children()}
{/if}
