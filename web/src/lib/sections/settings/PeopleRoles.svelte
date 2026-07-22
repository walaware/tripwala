<script>
  import { labelClass } from './styles.js';
  import { fmtRelative } from '$lib/format.js';
  import JoinRequests from '$lib/sections/JoinRequests.svelte';

  /**
   * Roles management (organizers): approve/deny join requests, promote/demote,
   * remove members, and revoke outstanding email invites. Inviting NEW people
   * (links + typeahead + co-organizer) lives in the "Who's in" invite modal now.
   *
   * @type {{
   *   members: Array<{ id: string, display_name: string, role: string }>,
   *   pending: Array<{ id: string, display_name: string, avatar?: string }>,
   *   invites: Array<{ id: string, email: string, role: string, invitedBy?: string | null, lastSent?: string }>,
   *   tripInvitations?: Array<{ id: string, name: string, avatar?: string, role: string }>,
   *   currentParticipantId: string | null,
   *   emailEnabled?: boolean,
   *   busy: string,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>
   * }}
   */
  let { members, pending, invites, tripInvitations = [], currentParticipantId,
    emailEnabled = false, busy, act } = $props();
</script>

{#if pending.length}
  <div class="mb-3.5">
    <JoinRequests {pending} {busy} {act} />
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

{#if invites.length || tripInvitations.length}
  <div class="mt-4">
    <div class="font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-400">
      Invited, waiting to hear back ({invites.length + tripInvitations.length})
    </div>
    <div class="mt-1.5 flex flex-col gap-1.5">
      <!-- Email invites: an address only, so they get a resend (the usual reason
           one goes quiet is that it landed in spam). -->
      {#each invites as inv (inv.id)}
        <div class="flex items-center gap-2 rounded-lg bg-sand-100 px-3 py-2">
          <span class="shrink-0 text-[13px]" title="Invited by email">✉️</span>
          <span class="min-w-0 flex-1 truncate">
            <span class="font-body text-[13.5px] font-extrabold text-cocoa-900">{inv.email}</span>
            <span class="font-body text-[11.5px] font-bold text-cocoa-400">
              {#if inv.lastSent}· sent {fmtRelative(inv.lastSent)} ago{/if}{#if inv.invitedBy} · by {inv.invitedBy}{/if}
            </span>
          </span>
          <span class="shrink-0 font-body text-[11px] font-extrabold uppercase tracking-wide text-coral-600">{inv.role === 'organizer' ? 'Organizer' : 'Guest'}</span>
          {#if emailEnabled}
            <button
              type="button" disabled={busy === 'reInv-' + inv.id} title="Send the invite email again"
              onclick={() => act('resend_invite', { inviteId: inv.id }, 'reInv-' + inv.id)}
              class="shrink-0 rounded-full border-2 border-sand-300 px-2.5 py-1 font-body text-[12px] font-extrabold text-cocoa-700 hover:border-coral-300 disabled:opacity-50"
            >{busy === 'reInv-' + inv.id ? 'Sending…' : 'Resend'}</button>
          {/if}
          <button
            type="button" disabled={busy === 'rmInv-' + inv.id} title="Revoke invite"
            onclick={() => act('revoke_invite', { inviteId: inv.id }, 'rmInv-' + inv.id)}
            class="shrink-0 rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200 disabled:opacity-50"
          >Revoke</button>
        </div>
      {/each}

      <!-- Friend invitations: a known account, so it's sitting on their bell —
           nothing to resend, just revoke. -->
      {#each tripInvitations as inv (inv.id)}
        <div class="flex items-center gap-2 rounded-lg bg-sand-100 px-3 py-2">
          <span class="shrink-0 text-[13px]" title="Invited in the app">🔔</span>
          <span class="min-w-0 flex-1 truncate">
            <span class="font-body text-[13.5px] font-extrabold text-cocoa-900">{inv.name}</span>
            <span class="font-body text-[11.5px] font-bold text-cocoa-400"> · waiting on their reply</span>
          </span>
          <span class="shrink-0 font-body text-[11px] font-extrabold uppercase tracking-wide text-coral-600">{inv.role === 'organizer' ? 'Organizer' : 'Guest'}</span>
          <button
            type="button" disabled={busy === 'rmTi-' + inv.id} title="Revoke invitation"
            onclick={() => act('revoke_trip_invitation', { invitationId: inv.id }, 'rmTi-' + inv.id)}
            class="shrink-0 rounded-full px-2.5 py-1 font-body text-[12px] font-extrabold text-berry-600 hover:bg-berry-200 disabled:opacity-50"
          >Revoke</button>
        </div>
      {/each}
    </div>
  </div>
{/if}
