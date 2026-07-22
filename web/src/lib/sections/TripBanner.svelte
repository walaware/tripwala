<script>
  import { tripHeroSrc, heroIsPhoto } from '$lib/tripHero.js';
  import { heroDefaultSrc } from '$lib/heroDefaults.js';

  /**
   * The trip's hero image as a low banner strip, sitting ABOVE the sticky
   * TripHeader.
   *
   * Deliberately not inside the header: AppShell measures `[data-appshell-sticky]`
   * to crossfade the header into the mobile top bar, and the header paints an
   * opaque background to make that work. Bleeding an image behind it would mean
   * reworking that contract; a sibling strip above costs a little height and no
   * risk.
   *
   * It fades to the app background at its base so it reads as part of the page
   * rather than a pasted-in rectangle, and renders nothing at all when the trip
   * has no artwork — no empty grey box.
   *
   * @type {{
   *   trip: { heroImage?: string, trip_type?: string | null, pickedLocation?: { image?: string, previewImage?: string } | null },
   *   alt?: string
   * }}
   */
  let { trip, alt = '' } = $props();

  const src = $derived(tripHeroSrc(trip, heroDefaultSrc(trip?.trip_type)));
  // A real photo is unpredictable, so it gets a stronger wash to keep the header
  // legible beneath it. Generated type artwork is already low-contrast.
  const isPhoto = $derived(heroIsPhoto(trip));
</script>

{#if src}
  <div class="trip-banner" class:photo={isPhoto} aria-hidden={alt ? undefined : 'true'}>
    <img {src} alt={alt || ''} loading="eager" decoding="async" />
  </div>
{/if}

<style>
  .trip-banner {
    position: relative;
    /* Low by design — tall enough to set a mood, short enough that the trip's
       actual content stays above the fold on a phone. */
    height: 108px;
    margin-bottom: calc(var(--stack-gap, 14px) * -1);
    overflow: hidden;
    border-radius: var(--radius-lg, 14px);
    background: var(--color-sand-200);
  }

  @media (min-width: 640px) {
    .trip-banner {
      height: 132px;
    }
  }

  .trip-banner img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 42%;
    display: block;
  }

  /* Fade the base into the page so the sticky header appears to rise out of it
     rather than sit on a hard edge. */
  .trip-banner::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      transparent 40%,
      color-mix(in srgb, var(--color-bg-app) 70%, transparent) 78%,
      var(--color-bg-app) 100%
    );
  }

  .trip-banner.photo::after {
    background:
      linear-gradient(
        to bottom,
        color-mix(in srgb, var(--color-bg-app) 18%, transparent) 0%,
        color-mix(in srgb, var(--color-bg-app) 72%, transparent) 74%,
        var(--color-bg-app) 100%
      );
  }

  @media (prefers-reduced-motion: no-preference) {
    .trip-banner img {
      transition: transform 400ms ease;
    }
  }
</style>
