<script>
  import { SegmentedControl } from '@walaware/design';
  import { hintClass } from './styles.js';
  import { VISIBILITY_CHOICES, tripVisibility } from '$lib/visibility.js';

  /**
   * Friends'-calendar privacy (organizers): what a shared trip reveals on
   * friends' calendars. The join / who-can-share policy moved next to the share
   * link inside the invite modal — this is the only access control that stays in
   * Trip settings.
   *
   * @type {{
   *   ownerMode: boolean,
   *   visibility: string,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>
   * }}
   */
  let { ownerMode, visibility, act } = $props();

  const visibilityHint = $derived(
    VISIBILITY_CHOICES.find((c) => c.value === tripVisibility({ visibility }))?.hint ?? ''
  );
</script>

{#if ownerMode}
  <SegmentedControl
    options={VISIBILITY_CHOICES.map(({ value, label }) => ({ value, label }))}
    value={tripVisibility({ visibility })}
    onChange={(v) => act('set_visibility', { value: v }, 'visibility')}
  />
  <p class="mt-1.5 {hintClass}">{visibilityHint}</p>
{/if}
