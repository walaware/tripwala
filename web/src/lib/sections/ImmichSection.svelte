<script>
  // Photos (#21) — embeds the trip's shared Immich album inline so attendees see
  // it live, without tripwala ever copying the photos. The album lives in Immich;
  // we just frame the shared link. Only rendered when an album is linked.
  //
  // Some Immich instances send X-Frame-Options/CSP that blocks framing — the
  // "Open album" link below is the always-works fallback.
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';

  /**
   * @type {{
   *   url: string,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null
   * }}
   */
  let { url, collapsed = false, onToggle = null, onHide = null,
    onSettings = null } = $props();
</script>

<SectionHeader emoji="📷" title="Photos" subtitle="— shared album" {collapsed} {onToggle} {onHide} {onSettings} />
<Card>
  <div class="overflow-hidden rounded-2xl border-2 border-sand-300 bg-sand-100">
    <iframe
      src={url}
      title="Shared photo album"
      loading="lazy"
      referrerpolicy="no-referrer"
      class="h-[480px] w-full border-0 bg-white"
    ></iframe>
  </div>
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    class="mt-2 inline-block font-body text-[13px] font-bold text-coral-600 hover:underline"
  >Open album in Immich ↗</a>
</Card>
