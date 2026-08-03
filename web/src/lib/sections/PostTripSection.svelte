<script>
  // Post-trip space (#post-trip photo wall). The celebratory "look back" at the
  // top of a finished trip: a scrapbook photo wall of REAL photos pulled from the
  // trip's Immich album (thumbnails come pre-proxied from the server — see
  // loadTrip.js + the [share_token]/photo route; the Immich key never reaches the
  // browser). The playful wall itself is the shared @walaware/design `PhotoWall`.
  //
  // Falls back to the existing inline embed when there are no fetched thumbnails
  // but an album link exists (a non-Immich album, or Immich unreachable), so a
  // finished trip with a shared album never shows nothing.
  import { PhotoWall } from '@walaware/design';
  import PhotoSection from './PhotoSection.svelte';
  import { fmtDateRange } from '$lib/format.js';

  /**
   * @type {{
   *   trip: any,
   *   participants?: any[],
   *   photos?: { id: string, thumb: string }[]
   * }}
   */
  let { trip, participants = [], photos = [] } = $props();

  const wallPhotos = $derived(
    (photos ?? []).map((/** @type {{ thumb: string }} */ p) => ({
      src: p.thumb,
      alt: `Photo from ${trip.name}`
    }))
  );
  const crew = $derived((participants ?? []).length);
  const subtitle = $derived(
    [
      trip.start_date ? fmtDateRange(trip.start_date, trip.end_date) : '',
      crew ? `${crew} crew` : ''
    ]
      .filter(Boolean)
      .join(' · ')
  );
  const albumUrl = $derived((trip.photo_album_url || '').trim());
</script>

{#if wallPhotos.length}
  <!-- No title: the trip name already headlines the cover-hero right above this. -->
  <PhotoWall {subtitle} {albumUrl} photos={wallPhotos} />
{:else if albumUrl}
  <PhotoSection url={albumUrl} />
{/if}
