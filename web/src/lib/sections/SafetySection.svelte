<script>
  // Emergency / safety card (#4) — the trip's at-a-glance backcountry info
  // (nearest hospital, ranger station, emergency contacts). Free text entered by
  // the organizer in Trip settings; rendered with line breaks. Only shown when
  // something's been filled in.
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';

  /**
   * @type {{
   *   info: string,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { info, collapsed = false, onToggle = null } = $props();
</script>

<SectionHeader emoji="🚨" title="Safety" subtitle="— emergency info" {collapsed} {onToggle} />
<Card>
  <div class="rounded-2xl border-2 border-berry-200 bg-berry-100 p-4">
    <p class="whitespace-pre-line break-words font-body text-[13.5px] font-bold leading-relaxed text-cocoa-800">{info}</p>
  </div>
</Card>
