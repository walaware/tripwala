<script>
  import '../app.css';
  import { AppShell } from '@walaware/design';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { createShell } from '$lib/shell.svelte.js';
  import { displayName } from '$lib/displayName.js';
  import { fmtRelative } from '$lib/format.js';

  /** @type {{ children: import('svelte').Snippet, data: import('./$types').LayoutData }} */
  let { children, data } = $props();

  const user = $derived(data.user);
  const path = $derived(page.url.pathname);
  // Incoming friend-request count (loaded on the dashboard) → nav badge.
  const friendRequests = $derived(page.data.friendRequests ?? 0);

  // Notification bell (shell surface). The layout load (+layout.server.js) serves
  // the feed on every route; here we map the server rows to the kit's
  // NotificationItem shape and attach inline Accept/Decline handlers that POST to
  // /notifications, then invalidate so the panel re-renders in place.
  const notifRows = $derived(page.data.notifications ?? []);
  const notifUnread = $derived(page.data.notificationsUnread ?? 0);

  /** @type {string | null} — the notification currently mid-action (buttons disabled). */
  let notifBusy = $state(null);

  /**
   * POST an op to the notifications endpoint. On a trip-invite accept the server
   * returns the trip's share_token so we can land the user on it.
   * @param {'markRead'|'markAllRead'|'accept'|'decline'} op
   * @param {string} [id]
   */
  async function notifAction(op, id) {
    try {
      const res = await fetch('/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op, id })
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      await invalidateAll();
      if (body?.share_token) await goto(`/${body.share_token}`);
    } catch (_) {
      // Network hiccup — leave the item in place; the next open re-fetches.
    }
  }

  async function actOnNotif(/** @type {string} */ id, /** @type {'accept'|'decline'} */ op) {
    if (notifBusy) return;
    notifBusy = id;
    try {
      await notifAction(op, id);
    } finally {
      notifBusy = null;
    }
  }

  const notifications = $derived(
    user
      ? {
          unread: notifUnread,
          // Opening the bell marks the feed seen → clears the badge. Items stay in
          // the list (only `read`, not dismissed) so they're still actionable.
          onOpen: notifUnread > 0 ? () => notifAction('markAllRead') : undefined,
          empty: 'You’re all caught up.',
          items: notifRows.map((/** @type {any} */ n) => ({
            key: n.id,
            icon: n.type === 'friend_request' ? '👋' : '🧭',
            title: n.title,
            meta:
              n.type === 'trip_invitation' && n.trip?.name
                ? `${n.trip.name} · ${fmtRelative(n.created)}`
                : fmtRelative(n.created),
            read: n.read,
            actions: [
              {
                key: 'accept',
                label: n.type === 'friend_request' ? 'Accept' : 'Join',
                variant: 'primary',
                disabled: notifBusy === n.id,
                onClick: () => actOnNotif(n.id, 'accept')
              },
              {
                key: 'decline',
                label: 'Decline',
                variant: 'ghost',
                disabled: notifBusy === n.id,
                onClick: () => actOnNotif(n.id, 'decline')
              }
            ]
          }))
        }
      : null
  );
  // The trip currently in view, if any — settings is a per-trip surface.
  const tripToken = $derived(page.params.share_token ?? null);

  // Shell holder: an open trip publishes its section nav + title here (see
  // TripView), flipping the AppShell into contextual mode. Null = app level.
  const shell = createShell();
  const inTrip = $derived(shell.trip != null);

  // App-level destinations (design repo → docs/apps/tripwala.md): Trips and Ideas
  // are live; Calendar · Planner · Map are dimmed `soon` roadmap rows. Trips stays
  // active while a trip is open (it opens as a contextual section nav). Ideas is
  // the undated "Someday" wishlist — trips still in the idea stage.
  const appNav = $derived([
    {
      key: 'trips',
      label: 'Trips',
      icon: '🧭',
      active: path === '/' || path === '/new' || tripToken != null,
      href: '/'
    },
    {
      key: 'ideas',
      label: 'Ideas',
      icon: '💭',
      active: path === '/ideas',
      href: '/ideas'
    },
    {
      key: 'bookings',
      label: 'Bookings',
      icon: '🎫',
      active: path === '/bookings',
      href: '/bookings'
    },
    {
      key: 'calendar',
      label: 'Calendar',
      icon: '📅',
      active: path === '/calendar',
      href: '/calendar'
    },
    {
      key: 'friends',
      label: 'Friends',
      icon: '👋',
      active: path === '/friends' || path.startsWith('/add-friend'),
      href: '/friends',
      badge: friendRequests > 0 ? friendRequests : false
    },
    { key: 'planner', label: 'Planner', icon: '🗓️', soon: true },
    { key: 'map', label: 'Map', icon: '🗺️', soon: true }
  ]);

  // Contextual mode swaps the global destinations for the open trip's section
  // nav (in-page anchors, driven by scrollSpy) and adds a "← All trips" exit.
  const nav = $derived(shell.trip ? shell.trip.nav : appNav);
  // A contextual screen can override the exit target (e.g. Trip settings points
  // "back" at its trip, not the global trips list); otherwise a trip exits to
  // "All trips".
  const back = $derived(shell.trip?.back ?? (inTrip ? { label: 'All trips', onClick: () => goto('/') } : null));
  // Contextual top-bar identity. The kit (v0.5.0) collapses the trip page's
  // `[data-appshell-sticky]` header into the top bar on mobile, crossfading the
  // brand → this icon + title + subtitle. We just hand it the values; the shell
  // owns the animation, the icon swap, and the scroll math.
  const tripTitle = $derived(shell.trip?.title ?? null);
  const tripSubtitle = $derived(shell.trip?.subtitle ?? null);
  const tripIcon = $derived(shell.trip?.emoji ?? null);

  // Always-available desktop sidebar (AppShell default): sidebar ≥ 920px, top-bar
  // + drawer below. The soon rows give the app-level sidebar real substance.
  const breakpoint = 920;

  // Sign-out is a POST action; the account button submits the hidden form below.
  /** @type {HTMLFormElement | undefined} */
  let logoutForm = $state();
  const account = $derived(
    user
      ? {
          name: displayName(user.name, user) || user.email,
          avatar: user.avatar || undefined, // resolved photo URL (Google CDN or /api/files/…); falls back to initial
          // The shell account avatar (sidebar + mobile top bar) opens the profile
          // editor — available everywhere, not just the dashboard.
          onProfile: () => goto('/profile'),
          onSignOut: () => logoutForm?.requestSubmit()
        }
      : null
  );

  // Trip settings is its own screen (the redesign's "one home"): the shell's
  // Settings gear routes there whenever a trip is in view — contextual dashboard
  // OR the settings route itself. Account / profile is reached via the avatar's
  // onProfile, not this gear.
  const onSettings = $derived(tripToken ? () => goto(`/${tripToken}/settings`) : null);
  const settingsActive = $derived(path.endsWith('/settings'));
</script>

{#if user}
  <AppShell
    app="tripwala"
    {nav}
    {account}
    {notifications}
    {onSettings}
    {settingsActive}
    {back}
    title={tripTitle}
    subtitle={tripSubtitle}
    icon={tripIcon}
    scrollSpy={inTrip && (shell.trip?.scrollSpy ?? true)}
    maxWidth={inTrip ? 1180 : undefined}
    {breakpoint}
  >
    {@render children()}
  </AppShell>
  <form bind:this={logoutForm} method="POST" action="/logout" class="hidden"></form>
{:else}
  <!-- Logged-out / auth pages bring their own full-bleed chrome. -->
  {@render children()}
{/if}
