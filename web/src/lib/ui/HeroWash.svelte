<script>
  import { tripHeroSrc } from '$lib/tripHero.js';
  import { heroDefaultSrc } from '$lib/heroDefaults.js';

  /**
   * The trip's hero image as a very faint wash behind a card's content — the
   * same artwork as the trip page banner, so a trip looks like itself in both
   * places.
   *
   * Kept deliberately low-contrast: this sits UNDER body text, so it has to read
   * as texture, not as a picture. It fades out to the left, where the emoji tile
   * and the trip name live, and is skipped entirely when there's no artwork.
   *
   * The parent must be `position: relative; overflow: hidden`.
   *
   * @type {{
   *   trip: { heroImage?: string, trip_type?: string | null, pickedLocation?: { image?: string, previewImage?: string } | null },
   *   opacity?: number
   * }}
   */
  let { trip, opacity = 0.16 } = $props();

  const src = $derived(tripHeroSrc(trip, heroDefaultSrc(trip?.trip_type)));
</script>

{#if src}
  <div class="hero-wash" style="--wash-opacity: {opacity}" aria-hidden="true">
    <img {src} alt="" loading="lazy" decoding="async" />
  </div>
{/if}

<style>
  .hero-wash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* Text sits above this; the card's own background sits below. */
    z-index: 0;
  }

  .hero-wash img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 45%;
    display: block;
    opacity: var(--wash-opacity, 0.16);
    /* Clear the left edge so the emoji tile and title keep full contrast. */
    mask-image: linear-gradient(to left, black 0%, black 45%, transparent 92%);
    -webkit-mask-image: linear-gradient(to left, black 0%, black 45%, transparent 92%);
  }

  /* A photo behind small text is the risky case — pull it back further. */
  @media (prefers-contrast: more) {
    .hero-wash img {
      opacity: 0.06;
    }
  }
</style>
