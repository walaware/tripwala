<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Button, Avatar, DateField } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { albumName } from '$lib/format.js';

  /**
   * @type {{
   *   shareToken: string,
   *   ownerMode?: boolean,
   *   me?: { name: string, notify?: boolean } | null,
   *   trip: any,
   *   members?: Array<{ id: string, display_name: string, role: string }>,
   *   currentParticipantId?: string | null,
   *   showSections?: boolean,
   *   joinPolicy?: string,
   *   inviteVisibility?: string,
   *   pending?: Array<{ id: string, display_name: string, avatar?: string }>,
   *   invites?: Array<{ id: string, email: string, role: string }>,
   *   emailEnabled?: boolean,
   *   immichEnabled?: boolean,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let {
    shareToken, ownerMode = false, me = null, trip, members = [], currentParticipantId = null,
    showSections = true, joinPolicy = 'instant', inviteVisibility = 'everyone', pending = [],
    invites = [], emailEnabled = false, immichEnabled = false, collapsed = false, onToggle = null
  } = $props();

  const TYPES = [
    ['camping', '🏕️ Camping'], ['backpacking', '🎒 Backpacking'], ['road_trip', '🚗 Road trip'],
    ['cabin', '🛖 Cabin'], ['ski', '⛷️ Ski'], ['beach', '🏖️ Beach'], ['city', '🏙️ City'],
    ['festival', '🎪 Festival'], ['other', '🧭 Other']
  ];
  // Hideable modules (Overview + Trip settings are always shown).
  const HIDEABLE = [
    ['dates', '📅 Dates'], ['map', '🗺️ Map'], ['crew', '🙌 Members'], ['gear', '🎒 Gear'],
    ['food', '🍳 Food'], ['packing', '🧳 Packing'], ['expenses', '💸 Expenses']
  ];

  /** Stored `<p>…</p>`+`<br>` → plain text for the textarea. @param {string} html */
  const descToText = (html) =>
    (html || '').replace(/^<p>/i, '').replace(/<\/p>$/i, '').replace(/<br\s*\/?>/gi, '\n')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  /** @param {string} d */
  const ymd = (d) => (d || '').slice(0, 10);

  // Details form state (organizer). Seeded from the trip; re-seed if it changes.
  let form = $state({ name: '', trip_type: '', location: '', start_date: '', end_date: '', description: '', emergency_info: '', expense_link: '', min_nights: 0 });
  let seeded = '';
  $effect(() => {
    const sig = `${trip.name}|${trip.start_date}|${trip.description}|${trip.emergency_info}|${trip.min_nights}`;
    if (sig !== seeded) {
      seeded = sig;
      form = {
        name: trip.name || '',
        trip_type: trip.trip_type || '',
        location: trip.location || '',
        start_date: ymd(trip.start_date),
        end_date: ymd(trip.end_date),
        description: descToText(trip.description),
        emergency_info: trip.emergency_info || '',
        expense_link: trip.expense_link || '',
        min_nights: trip.min_nights || 0
      };
    }
  });

  let busy = $state('');
  let savedFlash = $state(false);
  let cloning = $state(false);
  /** @param {string} op @param {Record<string, unknown>} payload @param {string} [tag] */
  async function act(op, payload = {}, tag = op) {
    if (busy) return;
    busy = tag;
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
      if (op === 'trip_update') {
        savedFlash = true;
        setTimeout(() => (savedFlash = false), 1500);
      }
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  // Immich album (organizer): create / link / unlink. Separate from act() so we
  // can surface the failure reason (Immich down, misconfigured, bad link).
  let albumBusy = $state('');
  let albumError = $state('');
  let linkUrl = $state('');
  const hasAlbum = $derived(!!(trip.immich_album_url || '').trim());
  /** @param {string} op @param {Record<string, unknown>} payload @param {string} tag */
  async function albumAct(op, payload, tag) {
    if (albumBusy) return;
    albumBusy = tag;
    albumError = '';
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
      linkUrl = '';
    } catch (/** @type {any} */ e) {
      albumError = e?.message || 'Something went wrong';
    } finally {
      albumBusy = '';
    }
  }

  async function leave() {
    if (busy) return;
    if (!confirm('Leave this trip? You can re-join later from the invite link.')) return;
    busy = 'leave';
    try {
      await tripAction(shareToken, { op: 'leave_trip' });
      await goto('/');
    } catch (_) {
      busy = '';
    }
  }

  const hidden = $derived(new Set(trip.hidden_sections ?? []));
  const ownerUrl = $derived(`${page.url.origin}/${shareToken}/edit?owner=${trip.owner_token}`);
  const inviteUrl = $derived(`${page.url.origin}/${shareToken}`);
  // Guests see the invite link only when the organizer allows it; organizers always do.
  const showInvite = $derived(ownerMode || inviteVisibility === 'everyone');
  let copied = $state(false);
  let invCopied = $state(false);
  async function copyOwner() {
    try {
      await navigator.clipboard.writeText(ownerUrl);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (_) { /* clipboard blocked */ }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      invCopied = true;
      setTimeout(() => (invCopied = false), 1500);
    } catch (_) { /* clipboard blocked */ }
  }

  // Invite by email (only when SMTP is configured server-side).
  let inviteEmail = $state('');
  let inviteSent = $state(false);
  let inviteError = $state('');
  const validEmail = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail.trim()));
  async function sendInvite() {
    if (!validEmail || busy) return;
    busy = 'invite_email';
    inviteError = '';
    inviteSent = false;
    try {
      await tripAction(shareToken, { op: 'invite_email', email: inviteEmail.trim() });
      inviteSent = true;
      inviteEmail = '';
      setTimeout(() => (inviteSent = false), 2500);
    } catch (_) {
      inviteError = "Couldn't send — check the address (and that email is set up).";
    } finally {
      busy = '';
    }
  }

  // Invite a co-organizer by email (#16): records an organizer grant so they
  // join straight as an organizer, and emails the invite link if SMTP is set up.
  let coOrgEmail = $state('');
  let coOrgMsg = $state('');
  let coOrgError = $state('');
  const validCoOrg = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coOrgEmail.trim()));
  async function inviteCoOrganizer() {
    if (!validCoOrg || busy) return;
    busy = 'invite_organizer';
    coOrgError = '';
    coOrgMsg = '';
    try {
      const res = await tripAction(shareToken, { op: 'invite_organizer', email: coOrgEmail.trim() });
      coOrgMsg = res?.emailed
        ? 'Invited — we emailed them the link.'
        : 'Invited — share the invite link with them; they join as an organizer.';
      coOrgEmail = '';
      await invalidateAll();
      setTimeout(() => (coOrgMsg = ''), 4000);
    } catch (_) {
      coOrgError = "Couldn't send the invite — try again.";
    } finally {
      busy = '';
    }
  }
  /** @param {string} id */
  async function revokeInvite(id) {
    await act('revoke_invite', { inviteId: id }, 'rmInv-' + id);
  }

  // Segmented-control button classes for the access toggles.
  const seg = 'flex-1 rounded-lg border-2 px-3 py-2 font-body text-[13px] font-extrabold transition';
  const segOn = 'border-coral-400 bg-coral-200 text-coral-700';
  const segOff = 'border-sand-300 bg-white text-cocoa-600 hover:border-coral-300';

  const notifyOn = $derived(me?.notify !== false);
  const inputClass =
    'w-full rounded-md border-2 border-sand-300 bg-white px-3 py-2.5 font-body text-[15px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
  const labelClass = 'mb-1 block font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500';
</script>

<SectionHeader emoji="⚙️" title="Settings" {collapsed} {onToggle} />
<Card>
  <!-- Everyone: your own preferences -->
  {#if me}
    <div class="flex items-center gap-3 py-1">
      <span class="w-6 text-center text-[18px]">🔔</span>
      <div class="min-w-0 flex-1">
        <div class="font-body text-[14.5px] font-extrabold text-text-strong">Trip notifications</div>
        <div class="font-body text-[12.5px] font-bold text-text-muted">Claims, RSVPs and meal updates</div>
      </div>
      <button
        type="button" role="switch" aria-checked={notifyOn} aria-label="Trip notifications"
        disabled={busy === 'notify_toggle'} onclick={() => act('notify_toggle')}
        class="flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors {notifyOn ? 'justify-end bg-[var(--color-primary)]' : 'justify-start bg-sand-300'}"
      ><span class="block h-[22px] w-[22px] rounded-full bg-white shadow-soft"></span></button>
    </div>
    <div class="flex items-center justify-between gap-3 border-t border-sand-200 pt-3.5">
      <div class="flex items-center gap-3">
        <span class="w-6 text-center text-[18px]">🚪</span>
        <div>
          <div class="font-body text-[14.5px] font-extrabold text-text-strong">Leave this trip</div>
          <div class="font-body text-[12.5px] font-bold text-text-muted">You'll stop getting updates</div>
        </div>
      </div>
      <Button variant="ghost" size="sm" disabled={busy === 'leave'} onclick={leave}>Leave</Button>
    </div>
    <!-- Clone: copy this trip's gear/packing/meals into a new planning trip you own. -->
    <form
      method="POST"
      action="?/clone"
      use:enhance={() => {
        cloning = true;
        return async ({ update }) => {
          await update();
          cloning = false;
        };
      }}
      class="flex items-center justify-between gap-3 border-t border-sand-200 pt-3.5"
    >
      <div class="flex items-center gap-3">
        <span class="w-6 text-center text-[18px]">📋</span>
        <div>
          <div class="font-body text-[14.5px] font-extrabold text-text-strong">Clone this trip</div>
          <div class="font-body text-[12.5px] font-bold text-text-muted">Copy the gear, packing &amp; meals into a new trip</div>
        </div>
      </div>
      <Button type="submit" variant="soft" size="sm" disabled={cloning}>{cloning ? 'Cloning…' : 'Make a copy'}</Button>
    </form>
  {/if}

  <!-- Invite link — guests see it only when the organizer allows sharing. -->
  {#if showInvite}
    <div class="{me ? 'mt-4 border-t border-sand-200 pt-4' : ''}">
      <div class="mb-1 font-display text-[15px] font-bold text-text-strong">Invite link</div>
      <p class="mb-2.5 font-body text-[12.5px] font-bold text-text-muted">
        {joinPolicy === 'approval'
          ? 'Anyone you send this to can request to join — an organizer approves them.'
          : 'Anyone you send this to can join instantly.'}
      </p>
      <div class="flex gap-2">
        <input readonly value={inviteUrl} class="{inputClass} min-w-0 flex-1 bg-sand-100" />
        <Button variant="soft" size="md" onclick={copyInvite}>{invCopied ? 'Copied!' : 'Copy'}</Button>
      </div>

      {#if emailEnabled}
        <div class="mt-3">
          <div class="mb-1 font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500">Or invite by email</div>
          <div class="flex gap-2">
            <input
              type="email"
              bind:value={inviteEmail}
              placeholder="name@email.com"
              class="{inputClass} min-w-0 flex-1"
              onkeydown={(e) => e.key === 'Enter' && sendInvite()}
            />
            <Button variant="primary" size="md" disabled={busy === 'invite_email' || !validEmail} onclick={sendInvite}>
              {busy === 'invite_email' ? 'Sending…' : inviteSent ? 'Sent ✓' : 'Send'}
            </Button>
          </div>
          {#if inviteError}<p class="mt-1 font-body text-xs font-bold text-berry-600">{inviteError}</p>{/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if ownerMode}
    <!-- Organizer: who can join + who can share -->
    <div class="mt-4 border-t border-sand-200 pt-4">
      <div class="font-display text-[15px] font-bold text-text-strong">Access</div>

      <div class="mt-2.5 font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500">How people join</div>
      <div class="mt-1.5 flex gap-2">
        <button type="button" disabled={busy === 'join_policy'} onclick={() => act('set_join_policy', { value: 'instant' }, 'join_policy')} class="{seg} {joinPolicy !== 'approval' ? segOn : segOff}">Instant</button>
        <button type="button" disabled={busy === 'join_policy'} onclick={() => act('set_join_policy', { value: 'approval' }, 'join_policy')} class="{seg} {joinPolicy === 'approval' ? segOn : segOff}">Request to join</button>
      </div>

      <div class="mt-3 font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500">Who can share the invite link</div>
      <div class="mt-1.5 flex gap-2">
        <button type="button" disabled={busy === 'invite_vis'} onclick={() => act('set_invite_visibility', { value: 'everyone' }, 'invite_vis')} class="{seg} {inviteVisibility !== 'organizers' ? segOn : segOff}">Everyone</button>
        <button type="button" disabled={busy === 'invite_vis'} onclick={() => act('set_invite_visibility', { value: 'organizers' }, 'invite_vis')} class="{seg} {inviteVisibility === 'organizers' ? segOn : segOff}">Organizers only</button>
      </div>

      <div class="mt-3 font-body text-[12px] font-extrabold uppercase tracking-wide text-cocoa-500">On friends' calendars</div>
      <div class="mt-1.5 flex gap-2">
        <button type="button" disabled={busy === 'visibility'} onclick={() => act('set_visibility', { value: 'private' }, 'visibility')} class="{seg} {(trip.visibility || 'private') !== 'friends' ? segOn : segOff}">Private</button>
        <button type="button" disabled={busy === 'visibility'} onclick={() => act('set_visibility', { value: 'friends' }, 'visibility')} class="{seg} {trip.visibility === 'friends' ? segOn : segOff}">Friends can see</button>
      </div>
      <p class="mt-1.5 font-body text-[12px] font-bold text-text-muted">
        When on, your friends see this trip's name, dates, and place on their calendar — never the plans inside.
      </p>

      {#if pending.length}
        <div class="mt-3.5 rounded-xl bg-sun-100 p-3">
          <div class="mb-1.5 font-display text-[14px] font-bold text-cocoa-900">Requests to join ({pending.length})</div>
          <div class="flex flex-col">
            {#each pending as p, i (p.id)}
              <div class="flex items-center gap-2 py-1.5 {i !== 0 ? 'border-t border-sun-200' : ''}">
                <Avatar name={p.display_name} src={p.avatar} size={28} />
                <span class="min-w-0 flex-1 truncate font-body text-[14px] font-extrabold text-cocoa-900">{p.display_name}</span>
                <Button variant="primary" size="sm" disabled={busy === 'ap-' + p.id} onclick={() => act('approve_member', { participantId: p.id }, 'ap-' + p.id)}>Approve</Button>
                <button type="button" disabled={busy === 'dn-' + p.id} onclick={() => act('deny_member', { participantId: p.id }, 'dn-' + p.id)} class="rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200">Deny</button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Organizer: shared photo album (Immich) — opt-in, never automatic -->
    <div class="mt-4 border-t border-sand-200 pt-4">
      <div class="font-display text-[15px] font-bold text-text-strong">📷 Photos</div>
      {#if hasAlbum}
        <p class="mt-1 font-body text-[12.5px] font-bold text-text-muted">
          A shared Immich album is linked to this trip.{#if trip.immich_album_linked} Its name stays in sync as "{albumName(trip)}".{/if}
        </p>
        <input readonly value={trip.immich_album_url} class="{inputClass} mt-2 w-full bg-sand-100" />
        <div class="mt-2 flex items-center gap-4">
          <a href={trip.immich_album_url} target="_blank" rel="noopener noreferrer" class="font-body text-[13px] font-bold text-coral-600 hover:underline">Open album ↗</a>
          <button type="button" disabled={albumBusy === 'unlink'} onclick={() => albumAct('album_unlink', {}, 'unlink')} class="font-body text-[12px] font-extrabold text-berry-600 hover:underline disabled:opacity-50">{albumBusy === 'unlink' ? 'Unlinking…' : 'Unlink'}</button>
        </div>
      {:else}
        {#if immichEnabled}
          <p class="mt-1 font-body text-[12.5px] font-bold text-text-muted">
            Create an empty shared album in Immich (named "{albumName(trip)}") for everyone to add photos to.
          </p>
          <div class="mt-2">
            <Button variant="primary" size="md" disabled={albumBusy === 'create'} onclick={() => albumAct('album_create', {}, 'create')}>
              {albumBusy === 'create' ? 'Creating…' : 'Create shared album'}
            </Button>
          </div>
        {:else}
          <p class="mt-1 font-body text-[12.5px] font-bold text-text-muted">
            Immich isn't set up for this instance — the admin can add it in global settings. You can still paste an existing album's share link below.
          </p>
        {/if}
        <div class="mt-3">
          <div class={labelClass}>Or link an existing album</div>
          <div class="flex gap-2">
            <input bind:value={linkUrl} placeholder="https://photos.example/share/…" class="{inputClass} min-w-0 flex-1" />
            <Button variant="soft" size="md" disabled={albumBusy === 'link' || !linkUrl.trim()} onclick={() => albumAct('album_link', { url: linkUrl }, 'link')}>
              {albumBusy === 'link' ? 'Linking…' : 'Link'}
            </Button>
          </div>
        </div>
      {/if}
      {#if albumError}<p class="mt-1.5 font-body text-xs font-bold text-berry-600">{albumError}</p>{/if}
    </div>

    <!-- Organizer: edit trip details -->
    <div class="mt-4 border-t border-sand-200 pt-4">
      <div class="mb-2.5 flex items-center gap-2">
        <span class="font-display text-[15px] font-bold text-text-strong">Edit trip details</span>
        {#if savedFlash}<span class="font-body text-[12px] font-extrabold text-leaf-600">Saved ✓</span>{/if}
      </div>
      <div class="flex flex-col gap-2.5">
        <div>
          <label class={labelClass} for="ts-name">Trip name</label>
          <input id="ts-name" bind:value={form.name} maxlength="200" class={inputClass} />
        </div>
        <div class="flex gap-2.5">
          <div class="min-w-0 flex-1">
            <label class={labelClass} for="ts-type">Type</label>
            <select id="ts-type" bind:value={form.trip_type} class={inputClass}>
              <option value="">Pick one…</option>
              {#each TYPES as [v, l]}<option value={v}>{l}</option>{/each}
            </select>
          </div>
          <div class="min-w-0 flex-1">
            <label class={labelClass} for="ts-loc">Where</label>
            <input id="ts-loc" bind:value={form.location} maxlength="300" class={inputClass} />
          </div>
        </div>
        <DateField range bind:start={form.start_date} bind:end={form.end_date} startLabel="Start" endLabel="End" />
        <div>
          <label class={labelClass} for="ts-min-nights">Minimum nights</label>
          <input id="ts-min-nights" type="number" inputmode="numeric" min="0" max="365" bind:value={form.min_nights} class={inputClass} />
          <p class="mt-1 font-body text-[12px] font-bold text-cocoa-400">
            {Number(form.min_nights) > 0
              ? `Proposed dates must span at least ${form.min_nights} night${Number(form.min_nights) === 1 ? '' : 's'}.`
              : '0 = no minimum. Set this so nobody proposes a single-day trip.'}
          </p>
        </div>
        <div>
          <label class={labelClass} for="ts-desc">The plan</label>
          <textarea id="ts-desc" bind:value={form.description} rows="3" maxlength="5000" class={inputClass}></textarea>
        </div>
        <div>
          <label class={labelClass} for="ts-emergency">🚨 Emergency info</label>
          <textarea id="ts-emergency" bind:value={form.emergency_info} rows="3" maxlength="2000" placeholder="Nearest hospital, ranger/park station, emergency contacts…" class={inputClass}></textarea>
          <p class="mt-1 font-body text-[12px] font-bold text-cocoa-400">Shown to everyone as a Safety card — handy for backcountry trips.</p>
        </div>
        <div>
          <label class={labelClass} for="ts-exp">Expense-split link</label>
          <input id="ts-exp" bind:value={form.expense_link} inputmode="url" placeholder="https://spliit.app/…" class={inputClass} />
        </div>
        <Button variant="primary" size="md" disabled={busy === 'trip_update' || !form.name.trim()} onclick={() => act('trip_update', form)}>
          {busy === 'trip_update' ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>

    <!-- Organizer: restore hidden sections. Hiding now happens from each
         section's own "Hide" button, so this only appears once something's
         hidden — no standalone toggle manager. -->
    {#if showSections}
      {@const hiddenList = HIDEABLE.filter(([key]) => hidden.has(key))}
      {#if hiddenList.length}
        <div class="mt-4 border-t border-sand-200 pt-4">
          <div class="mb-1 font-display text-[15px] font-bold text-text-strong">Hidden sections</div>
          <div class="mb-2.5 font-body text-[12.5px] font-bold text-text-muted">Hidden for everyone on the trip — restore any to bring it back.</div>
          <div class="flex flex-wrap gap-2">
            {#each hiddenList as [key, label]}
              <button
                type="button" disabled={busy === 'sec-' + key}
                onclick={() => act('section_show', { key }, 'sec-' + key)}
                class="flex items-center gap-1.5 rounded-full border-2 border-sand-300 px-3 py-1.5 font-body text-[13px] font-extrabold text-cocoa-700 transition hover:border-coral-300 disabled:opacity-50"
              >{label} <span class="text-cocoa-400">· Restore</span></button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Organizer: roles & access. Compact management list — no roster (everyone
         already shows in "Who's coming"), just name + role + the controls. -->
    <div class="mt-4 border-t border-sand-200 pt-4">
      <div class="mb-1 font-display text-[15px] font-bold text-text-strong">Roles &amp; access</div>
      <div class="mb-1.5 font-body text-[12.5px] font-bold text-text-muted">Promote a co-organizer or remove someone. Everyone appears in “Members”.</div>
      <div class="flex flex-col">
        {#each members as m, i (m.id)}
          <div class="flex items-center gap-2 py-2 pr-1.5 {i !== 0 ? 'border-t border-sand-200' : ''}">
            <span class="min-w-0 flex-1 truncate font-body text-[14px] font-extrabold text-cocoa-900">
              {m.display_name}{#if m.id === currentParticipantId}<span class="font-bold text-cocoa-400"> (you)</span>{/if}
              <span class="ml-0.5 font-body text-[11px] font-extrabold uppercase tracking-wide {m.role === 'organizer' ? 'text-coral-600' : 'text-cocoa-400'}">· {m.role === 'organizer' ? 'Organizer' : 'Guest'}</span>
            </span>
            <div class="flex shrink-0 gap-1.5">
              <button
                type="button" disabled={busy === 'role-' + m.id}
                onclick={() => act('set_role', { participantId: m.id, role: m.role === 'organizer' ? 'guest' : 'organizer' }, 'role-' + m.id)}
                class="rounded-full border-2 border-sand-300 px-2.5 py-1 font-body text-[12px] font-extrabold text-cocoa-700 hover:border-coral-300"
              >{m.role === 'organizer' ? 'Make guest' : 'Make organizer'}</button>
              {#if m.id !== currentParticipantId}
                <button
                  type="button" disabled={busy === 'rm-' + m.id} title="Remove from trip"
                  onclick={() => act('remove_member', { participantId: m.id }, 'rm-' + m.id)}
                  class="rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200"
                >Remove</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-2 font-body text-[11.5px] font-bold text-cocoa-400">Name-only guests (not signed in) appear on the trip, not here.</p>
    </div>

    <!-- Organizer: invite a co-organizer by email -->
    <div class="mt-4 border-t border-sand-200 pt-4">
      <div class="mb-1 font-display text-[15px] font-bold text-text-strong">Add a co-organizer</div>
      <p class="mb-2.5 font-body text-[12.5px] font-bold text-text-muted">
        Invite by email — when they sign in to join, they land as an organizer.{#if !emailEnabled} (We'll record it; share the invite link with them since email isn't set up.){/if}
      </p>
      <div class="flex gap-2">
        <input
          type="email" bind:value={coOrgEmail} placeholder="name@email.com"
          autocomplete="off" class="{inputClass} flex-1"
          onkeydown={(e) => e.key === 'Enter' && inviteCoOrganizer()}
        />
        <Button variant="primary" size="md" onclick={inviteCoOrganizer} disabled={!validCoOrg || busy === 'invite_organizer'}>
          {busy === 'invite_organizer' ? 'Inviting…' : 'Invite'}
        </Button>
      </div>
      {#if coOrgMsg}<p class="mt-2 font-body text-[12.5px] font-bold text-leaf-600">{coOrgMsg}</p>{/if}
      {#if coOrgError}<p class="mt-2 font-body text-[12.5px] font-bold text-berry-600">{coOrgError}</p>{/if}

      {#if invites.length}
        <div class="mt-3 flex flex-col gap-1.5">
          <div class="font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400">Pending invites</div>
          {#each invites as inv (inv.id)}
            <div class="flex items-center gap-2 rounded-lg bg-sand-100 px-3 py-2">
              <span class="min-w-0 flex-1 truncate font-body text-[13.5px] font-extrabold text-cocoa-900">{inv.email}</span>
              <span class="shrink-0 font-body text-[11px] font-extrabold uppercase tracking-wide text-coral-600">{inv.role === 'organizer' ? 'Organizer' : 'Guest'}</span>
              <button
                type="button" disabled={busy === 'rmInv-' + inv.id} title="Revoke invite"
                onclick={() => revokeInvite(inv.id)}
                class="shrink-0 rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200 disabled:opacity-50"
              >Revoke</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Organizer: co-organizer link (no-email fallback / quick share) -->
    <div class="mt-4 border-t border-sand-200 pt-4">
      <div class="mb-1 font-display text-[15px] font-bold text-text-strong">Co-organizer link</div>
      <p class="mb-2.5 font-body text-[12.5px] font-bold text-text-muted">Or send this link to someone you want to co-run the trip — they sign in and become an organizer. Keep it private.</p>
      <div class="flex gap-2">
        <input readonly value={ownerUrl} class="{inputClass} flex-1 bg-sun-100" />
        <Button variant="soft" size="md" onclick={copyOwner}>{copied ? 'Copied!' : 'Copy'}</Button>
      </div>
    </div>
  {/if}
</Card>
