<script>
  import { tripHeroSrc, heroIsPhoto } from '$lib/tripHero.js';
  import { heroBannerSrc } from '$lib/heroDefaults.js';

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

  // Generated defaults use the banner-shaped crop; an uploaded cover or a
  // location photo is used whole (we can't pre-crop what the user supplied).
  const src = $derived(tripHeroSrc(trip, heroBannerSrc(trip?.trip_type)));
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
    /* The pre-cut band is 7:1 and the slot is ~9:1, so ~22% still gets trimmed.
       Anchor to the top so that comes off the BASE — solid ground the fade is
       already covering — rather than off the peaks of the silhouettes. */
    object-position: center top;
    display: block;
  }

  /* Fade the base into the page so the sticky header appears to rise out of it
     rather than sit on a hard edge. This has to start high and cover real
     distance — an earlier version compressed the whole gradient into the last
     ~20% against solid dark silhouettes, which read as a hard clip rather than
     a fade. */
  .trip-banner::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      color-mix(in srgb, var(--color-bg-app) 22%, transparent) 45%,
      color-mix(in srgb, var(--color-bg-app) 68%, transparent) 72%,
      color-mix(in srgb, var(--color-bg-app) 92%, transparent) 88%,
      var(--color-bg-app) 100%
    );
  }

  /* A real photo is unpredictable and usually busier, so it takes a heavier
     wash from the top down as well. */
  .trip-banner.photo::after {
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--color-bg-app) 16%, transparent) 0%,
      color-mix(in srgb, var(--color-bg-app) 40%, transparent) 50%,
      color-mix(in srgb, var(--color-bg-app) 78%, transparent) 78%,
      var(--color-bg-app) 100%
    );
  }

  @media (prefers-reduced-motion: no-preference) {
    .trip-banner img {
      transition: transform 400ms ease;
    }
  }
</style>
