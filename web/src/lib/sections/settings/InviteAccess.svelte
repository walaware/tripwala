<script>
  import { SegmentedControl } from '@walaware/design';
  import { labelClass, hintClass } from './styles.js';
  import { VISIBILITY_CHOICES, tripVisibility } from '$lib/visibility.js';

  /**
   * Access & privacy POLICY controls (organizers). The invite link + invite-by-
   * email inputs moved to the "Who's in" invite modal — this group now only sets
   * how people join, who can share, and what friends' calendars see.
   *
   * @type {{
   *   ownerMode: boolean,
   *   joinPolicy: string,
   *   inviteVisibility: string,
   *   visibility: string,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>
   * }}
   */
  let { ownerMode, joinPolicy, inviteVisibility, visibility, act } = $props();

  const visibilityHint = $derived(
    VISIBILITY_CHOICES.find((c) => c.value === tripVisibility({ visibility }))?.hint ?? ''
  );
</script>

{#if ownerMode}
  <div class="flex flex-col gap-3">
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
