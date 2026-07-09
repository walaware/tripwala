<script>
  import { invalidateAll } from '$app/navigation';
  import { Avatar, Button, CopyField } from '@walaware/design';
  import { inputClass, labelClass, hintClass } from './styles.js';
  import { tripAction } from '$lib/tripClient.js';

  /**
   * Everything about *who* is on the trip: join requests, roles, co-organizer
   * invites, and the co-organizer link.
   *
   * @type {{
   *   shareToken: string,
   *   ownerUrl: string,
   *   members: Array<{ id: string, display_name: string, role: string }>,
   *   pending: Array<{ id: string, display_name: string, avatar?: string }>,
   *   invites: Array<{ id: string, email: string, role: string }>,
   *   currentParticipantId: string | null,
   *   emailEnabled: boolean,
   *   busy: string,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>
   * }}
   */
  let {
    shareToken, ownerUrl, members, pending, invites, currentParticipantId, emailEnabled, busy, act
  } = $props();

  // Invite a co-organizer by email (#16): records an organizer grant so they
  // join straight as an organizer, and emails the link if SMTP is set up.
  let coOrgEmail = $state('');
  let coOrgMsg = $state('');
  let coOrgError = $state('');
  const validCoOrg = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coOrgEmail.trim()));

  async function inviteCoOrganizer() {
    if (!validCoOrg || busy) return;
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
    }
  }
</script>

{#if pending.length}
  <div class="mb-3.5 rounded-xl bg-sun-100 p-3">
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

<div class={labelClass}>Roles</div>
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

<div class="mt-4">
  <div class={labelClass}>Add a co-organizer</div>
  <p class="mb-2 {hintClass}">
    Invite by email — when they sign in to join, they land as an organizer.{#if !emailEnabled} (We'll record it; share the invite link with them since email isn't set up.){/if}
  </p>
  <div class="flex gap-2">
    <input
      type="email" bind:value={coOrgEmail} placeholder="name@email.com"
      autocomplete="off" class="{inputClass} min-w-0 flex-1"
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
            onclick={() => act('revoke_invite', { inviteId: inv.id }, 'rmInv-' + inv.id)}
            class="shrink-0 rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200 disabled:opacity-50"
          >Revoke</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<div class="mt-4">
  <div class={labelClass}>Co-organizer link</div>
  <p class="mb-2 {hintClass}">Or send this to someone you want to co-run the trip — they sign in and become an organizer. Keep it private.</p>
  <CopyField value={ownerUrl} ariaLabel="Co-organizer link" />
</div>
