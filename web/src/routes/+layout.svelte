<script>
  import '../app.css';
  import { AppShell } from '@walaware/design';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  /** @type {{ children: import('svelte').Snippet, data: import('./$types').LayoutData }} */
  let { children, data } = $props();

  const user = $derived(data.user);
  const path = $derived(page.url.pathname);
  // The trip currently in view, if any — settings is a per-trip surface.
  const tripToken = $derived(page.params.share_token ?? null);

  // Top-level destinations. Trips is the home list; a trip opens as a pushed
  // detail view, so it stays the active destination while inside one.
  const nav = $derived([
    {
      key: 'trips',
      label: 'Trips',
      icon: '🧭',
      active: path === '/' || path === '/new' || tripToken != null,
      href: '/'
    }
  ]);

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
  <!-- Single destination for now, so skip the persistent desktop sidebar: a very
       high breakpoint forces the compact top-bar + hamburger-drawer layout at all
       widths. Lower this to a normal value (e.g. 920) once there are more nav
       destinations worth a sidebar. -->
  <AppShell app="tripwala" {nav} {account} {onSettings} {settingsActive} breakpoint={100000}>
    {@render children()}
  </AppShell>
  <form bind:this={logoutForm} method="POST" action="/logout" class="hidden"></form>
{:else}
  <!-- Logged-out / auth pages bring their own full-bleed chrome. -->
  {@render children()}
{/if}
