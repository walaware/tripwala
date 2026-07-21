<script>
  import { invalidateAll } from '$app/navigation';
  import { Modal, Button, CopyField, SegmentedControl } from '@walaware/design';
  import { tripAction } from '$lib/tripClient.js';
  import FriendTypeahead from '$lib/FriendTypeahead.svelte';

  /**
   * The single "get people in" home, opened from the trip's "Who's in" header.
   * Share links + invite-by-name/email (friend typeahead) + (organizer) add a
   * co-organizer. Uses the shared `Modal` (centred dialog / mobile bottom sheet).
   *
   * @type {{
   *   open: boolean,
   *   onClose: () => void,
   *   shareToken: string,
   *   inviteUrl: string,
   *   ownerUrl: string,
   *   showInvite?: boolean,
   *   ownerMode?: boolean,
   *   joinPolicy?: string,
   *   inviteVisibility?: string,
   *   invitableFriends?: Array<{ id: string, name: string, avatar?: string }>,
   *   emailEnabled?: boolean
   * }}
   */
  let {
    open, onClose, shareToken, inviteUrl, ownerUrl, showInvite = false, ownerMode = false,
    joinPolicy = 'instant', inviteVisibility = 'everyone', invitableFriends = [], emailEnabled = false
  } = $props();

  /** @param {string} op @param {string} value */
  async function setPolicy(op, value) {
    if (busy) return;
    busy = op;
    try {
      await tripAction(shareToken, { op, value });
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  let status = $state('');
  let busy = $state('');
  let coOrgEmail = $state('');
  const validCoOrg = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coOrgEmail.trim()));

  const joinNote = $derived(
    joinPolicy === 'approval'
      ? 'People with this link request to join — you approve them.'
      : 'People with this link join instantly.'
  );

  /** @param {{ id: string, name: string }} friend */
  async function pickFriend(friend) {
    if (busy) return;
    busy = friend.id;
    status = '';
    try {
      const res = await tripAction(shareToken, { op: 'invite_friend', userId: friend.id });
      status = res?.ok === false ? `Couldn't invite ${friend.name}.` : `Invited ${friend.name} — it's on their dashboard. 🎉`;
      await invalidateAll();
    } catch (_) {
      status = `Couldn't invite ${friend.name} — try again.`;
    } finally {
      busy = '';
    }
  }

  /** @param {string} email */
  async function inviteEmail(email) {
    if (busy) return;
    busy = 'email';
    status = '';
    try {
      await tripAction(shareToken, { op: 'invite_email', email });
      status = `Emailed an invite to ${email}. ✉️`;
    } catch (_) {
      status = "Couldn't send that email — check the address.";
    } finally {
      busy = '';
    }
  }

  async function inviteCoOrganizer() {
    if (!validCoOrg || busy) return;
    busy = 'coorg';
    status = '';
    try {
      const res = await tripAction(shareToken, { op: 'invite_organizer', email: coOrgEmail.trim() });
      status = res?.emailed
        ? 'Co-organizer invited — we emailed them the link. ✨'
        : 'Co-organizer invited — share the link with them; they join as an organizer.';
      coOrgEmail = '';
      await invalidateAll();
    } catch (_) {
      status = "Couldn't send that invite — try again.";
    } finally {
      busy = '';
    }
  }

  const labelClass = 'mb-1.5 font-body text-[12.5px] font-extrabold text-text-muted';
  const inputClass = 'w-full rounded-md border-2 border-sand-300 bg-white px-3.5 py-2.5 font-body text-[14px] font-bold text-cocoa-900 outline-none focus:border-coral-400';
</script>

<Modal {open} {onClose} title="Invite to the trip" size="sm">
  <div class="flex flex-col gap-4">
    {#if showInvite}
      <div>
        <div class={labelClass}>Share the invite link</div>
        <CopyField value={inviteUrl} ariaLabel="Invite link" />
        <p class="mt-1 font-body text-[12px] font-bold text-text-muted">{joinNote}</p>
      </div>
    {/if}

    {#if ownerMode}
      <!-- These govern the link above, so they live next to it (moved out of
           Trip settings). -->
      <div>
        <div class={labelClass}>How people join</div>
        <SegmentedControl
          options={[
            { value: 'instant', label: 'Instant' },
            { value: 'approval', label: 'Request to join' }
          ]}
          value={joinPolicy === 'approval' ? 'approval' : 'instant'}
          onChange={(v) => setPolicy('set_join_policy', v)}
        />
      </div>
      <div>
        <div class={labelClass}>Who can invite &amp; share</div>
        <SegmentedControl
          options={[
            { value: 'everyone', label: 'Everyone' },
            { value: 'organizers', label: 'Organizers only' }
          ]}
          value={inviteVisibility === 'organizers' ? 'organizers' : 'everyone'}
          onChange={(v) => setPolicy('set_invite_visibility', v)}
        />
      </div>
    {/if}

    {#if ownerMode}
      <div>
        <div class={labelClass}>Co-organizer link</div>
        <CopyField value={ownerUrl} ariaLabel="Co-organizer link" />
        <p class="mt-1 font-body text-[12px] font-bold text-text-muted">They sign in and join as an organizer — keep this private.</p>
      </div>
    {/if}

    <div>
      <div class={labelClass}>Invite by name or email</div>
      <FriendTypeahead
        friends={invitableFriends}
        {emailEnabled}
        {busy}
        placeholder="Start typing a friend’s name…"
        onPick={pickFriend}
        onEmail={inviteEmail}
      />
      <p class="mt-1 font-body text-[12px] font-bold text-text-muted">
        Friends get an invitation on their dashboard — no link to copy.
      </p>
    </div>

    {#if ownerMode}
      <div>
        <div class={labelClass}>Add a co-organizer by email</div>
        <div class="flex gap-2">
          <input
            type="email"
            bind:value={coOrgEmail}
            placeholder="name@email.com"
            autocomplete="off"
            class="{inputClass} min-w-0 flex-1"
            onkeydown={(e) => e.key === 'Enter' && inviteCoOrganizer()}
          />
          <Button variant="soft" size="md" disabled={!validCoOrg || busy === 'coorg'} onclick={inviteCoOrganizer}>
            {busy === 'coorg' ? 'Inviting…' : 'Invite'}
          </Button>
        </div>
      </div>
    {/if}

    {#if status}
      <p class="rounded-md bg-leaf-100 px-3 py-2 font-body text-[13px] font-extrabold text-leaf-700">{status}</p>
    {/if}
  </div>
</Modal>
