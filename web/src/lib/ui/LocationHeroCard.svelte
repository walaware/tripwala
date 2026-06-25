<script>
  import { cardImage, cardDomain } from '$lib/locationCard.js';

  /**
   * Expanded location card for a confirmed trip — the picked idea's picture +
   * title, carried over from planning. Renders nothing unless there's an image
   * (custom upload or unfurled preview); the plain location text already shows in
   * the trip header.
   *
   * @type {{ location: { label:string, url?:string, note?:string, image?:string, previewImage?:string } | null }}
   */
  let { location } = $props();

  const img = $derived(location ? cardImage(location) : { src: '', isCustom: false });
  const domain = $derived(cardDomain(location?.url));
</script>

{#if location && img.src}
  <div class="relative mb-4 overflow-hidden rounded-2xl">
    <img src={img.src} alt={location.label} class="h-44 w-full object-cover sm:h-52" />
    <!-- Legibility scrim so the title reads over any photo. -->
    <div class="absolute inset-0 bg-gradient-to-t from-cocoa-900/75 via-cocoa-900/10 to-transparent"></div>
    <div class="absolute inset-x-0 bottom-0 p-3.5">
      <div class="font-body text-[11px] font-extrabold uppercase tracking-wide text-white/80">📍 Where we're going</div>
      <div class="mt-0.5 font-display text-[19px] font-bold leading-tight text-white">{location.label}</div>
      {#if location.url}
        <a href={location.url} target="_blank" rel="noopener" class="mt-1 inline-block font-body text-xs font-extrabold text-white/90 underline">
          {domain || 'link'} ↗
        </a>
      {/if}
    </div>
  </div>
{/if}
