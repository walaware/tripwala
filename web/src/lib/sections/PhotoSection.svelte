<script>
  // Photos (#21) — surfaces the trip's shared album inline so attendees see it
  // live, without tripwala ever copying the photos. The album lives with its
  // provider; we just frame or link to the shared URL. Only rendered when linked.
  //
  // Immich (self-hosted) frames fine. Google Photos / iCloud send
  // X-Frame-Options that block framing, so those link out instead of showing a
  // blank frame — see $lib/photoProviders.js. Even for framed providers, some
  // instances block embedding, so the "Open album" link is the always-works
  // fallback.
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { photoAlbum } from '$lib/photoProviders.js';

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

  const album = $derived(photoAlbum(url));
</script>

<SectionHeader emoji="📷" title="Photos" subtitle="— shared album" {collapsed} {onToggle} {onHide} {onSettings} />
<Card>
  {#if album?.embeddable}
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
    >Open album ↗</a>
  {:else}
    <div class="flex items-center gap-3 rounded-2xl border-2 border-sand-300 bg-sand-100 px-4 py-5">
      <span class="text-2xl" aria-hidden="true">📷</span>
      <div class="min-w-0">
        <p class="font-body text-sm font-bold text-cocoa-900">Shared on {album?.label}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          class="font-body text-[13px] font-bold text-coral-600 hover:underline"
        >Open in {album?.label} ↗</a>
      </div>
    </div>
  {/if}
</Card>
