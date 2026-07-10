<script>
  import { Button, SegmentedControl, CopyField } from '@walaware/design';
  import { inputClass, labelClass, hintClass } from './styles.js';
  import { tripAction } from '$lib/tripClient.js';
  import { VISIBILITY_CHOICES, tripVisibility } from '$lib/visibility.js';

  /**
   * Invite link, invite-by-email, and (organizers) the three access toggles.
   *
   * @type {{
   *   shareToken: string,
   *   inviteUrl: string,
   *   ownerMode: boolean,
   *   showInvite: boolean,
   *   joinPolicy: string,
   *   inviteVisibility: string,
   *   visibility: string,
   *   emailEnabled: boolean,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>
   * }}
   */
  let {
    shareToken, inviteUrl, ownerMode, showInvite, joinPolicy, inviteVisibility,
    visibility, emailEnabled, act
  } = $props();

  const visibilityHint = $derived(
    VISIBILITY_CHOICES.find((c) => c.value === tripVisibility({ visibility }))?.hint ?? ''
  );

  let inviteEmail = $state('');
  let sending = $state(false);
  let inviteSent = $state(false);
  let inviteError = $state('');
  const validEmail = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail.trim()));

  async function sendInvite() {
    if (!validEmail || sending) return;
    sending = true;
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
      sending = false;
    }
  }
</script>

{#if showInvite}
  <div class="mb-1 font-body text-[12.5px] font-bold text-text-muted">
    {joinPolicy === 'approval'
      ? 'Anyone you send this to can request to join — an organizer approves them.'
      : 'Anyone you send this to can join instantly.'}
  </div>
  <CopyField value={inviteUrl} ariaLabel="Invite link" />

  {#if emailEnabled}
    <div class="mt-3">
      <div class={labelClass}>Or invite by email</div>
      <div class="flex gap-2">
        <input
          type="email"
          bind:value={inviteEmail}
          placeholder="name@email.com"
          class="{inputClass} min-w-0 flex-1"
          onkeydown={(e) => e.key === 'Enter' && sendInvite()}
        />
        <Button variant="primary" size="md" disabled={!validEmail || sending} onclick={sendInvite}>
          {sending ? 'Sending…' : inviteSent ? 'Sent ✓' : 'Send'}
        </Button>
      </div>
      {#if inviteError}<p class="mt-1 font-body text-xs font-bold text-berry-600">{inviteError}</p>{/if}
    </div>
  {/if}
{/if}

{#if ownerMode}
  <div class="{showInvite ? 'mt-4' : ''} flex flex-col gap-3">
    <div>
      <div class={labelClass}>How people join</div>
      <SegmentedControl
        options={[
          { value: 'instant', label: 'Instant' },
          { value: 'approval', label: 'Request to join' }
        ]}
        value={joinPolicy === 'approval' ? 'approval' : 'instant'}
        onChange={(v) => act('set_join_policy', { value: v }, 'join_policy')}
      />
    </div>

    <div>
      <div class={labelClass}>Who can share the invite link</div>
      <SegmentedControl
        options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'organizers', label: 'Organizers only' }
        ]}
        value={inviteVisibility === 'organizers' ? 'organizers' : 'everyone'}
        onChange={(v) => act('set_invite_visibility', { value: v }, 'invite_vis')}
      />
    </div>

    <div>
      <div class={labelClass}>On friends' calendars</div>
      <SegmentedControl
        options={VISIBILITY_CHOICES.map(({ value, label }) => ({ value, label }))}
        value={tripVisibility({ visibility })}
        onChange={(v) => act('set_visibility', { value: v }, 'visibility')}
      />
      <p class="mt-1.5 {hintClass}">{visibilityHint}</p>
    </div>
  </div>
{/if}
