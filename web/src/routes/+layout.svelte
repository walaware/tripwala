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

  // App-level destinations. Trips is the home list; a trip opens as a contextual
  // section nav over one scrollable page, so Trips stays active inside one.
  const appNav = $derived([
    {
      key: 'trips',
      label: 'Trips',
      icon: '🧭',
      active: path === '/' || path === '/new' || tripToken != null,
      href: '/'
    }
  ]);

  // Contextual mode swaps the global destinations for the open trip's section
  // nav (in-page anchors, driven by scrollSpy) and adds a "← All trips" exit.
  const nav = $derived(shell.trip ? shell.trip.nav : appNav);
  const back = $derived(inTrip ? { label: 'All trips', onClick: () => goto('/') } : null);
  const title = $derived(shell.trip ? shell.trip.title : null);

  // App level has a single destination, so force the compact top-bar + drawer at
  // all widths. A contextual trip earns a real desktop sidebar for its section nav.
  const breakpoint = $derived(inTrip ? 920 : 100000);

  // Sign-out is a POST action; the account button submits the hidden form below.
  /** @type {HTMLFormElement | undefined} */
  let logoutForm = $state();
  const account = $derived(
    user
      ? {
          name: user.name || user.email,
          avatar: user.avatar || undefined, // Google profile photo (PB url field); falls back to initial
          onSignOut: () => logoutForm?.requestSubmit()
        }
      : null
  );

  // Settings affordance only inside a trip (where settings actually lives).
  const onSettings = $derived(tripToken ? () => goto(`/${tripToken}/settings`) : null);
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
