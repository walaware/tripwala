<script>
  import { invalidateAll } from '$app/navigation';
  import { Button, CopyField } from '@walaware/design';
  import { inputClass, labelClass, hintClass } from './styles.js';
  import { tripAction } from '$lib/tripClient.js';
  import { albumName } from '$lib/format.js';

  /**
   * Shared Immich album — opt-in, never automatic. Kept off the shared `act()`
   * so we can surface *why* it failed (Immich down, misconfigured, bad link).
   *
   * @type {{ shareToken: string, trip: any, immichEnabled: boolean }}
   */
  let { shareToken, trip, immichEnabled } = $props();

  let albumBusy = $state('');
  let albumError = $state('');
  let linkUrl = $state('');
  const hasAlbum = $derived(!!(trip.immich_album_url || '').trim());

  /** @param {string} op @param {Record<string, unknown>} payload @param {string} tag */
  async function albumAct(op, payload, tag) {
    if (albumBusy) return;
    albumBusy = tag;
    albumError = '';
    try {
      await tripAction(shareToken, { op, ...payload });
      await invalidateAll();
      linkUrl = '';
    } catch (/** @type {any} */ e) {
      albumError = e?.message || 'Something went wrong';
    } finally {
      albumBusy = '';
    }
  }
</script>

{#if hasAlbum}
  <p class={hintClass}>
    A shared Immich album is linked to this trip.{#if trip.immich_album_linked} Its name stays in sync as "{albumName(trip)}".{/if}
  </p>
  <div class="mt-2">
    <CopyField value={trip.immich_album_url} ariaLabel="Album link" />
  </div>
  <div class="mt-2 flex items-center gap-4">
    <a href={trip.immich_album_url} target="_blank" rel="noopener noreferrer" class="font-body text-[13px] font-bold text-coral-600 hover:underline">Open album ↗</a>
    <button type="button" disabled={albumBusy === 'unlink'} onclick={() => albumAct('album_unlink', {}, 'unlink')} class="font-body text-[12px] font-extrabold text-berry-600 hover:underline disabled:opacity-50">
      {albumBusy === 'unlink' ? 'Unlinking…' : 'Unlink'}
    </button>
  </div>
{:else}
  {#if immichEnabled}
    <p class={hintClass}>
      Create an empty shared album in Immich (named "{albumName(trip)}") for everyone to add photos to.
    </p>
    <div class="mt-2">
      <Button variant="primary" size="md" disabled={albumBusy === 'create'} onclick={() => albumAct('album_create', {}, 'create')}>
        {albumBusy === 'create' ? 'Creating…' : 'Create shared album'}
      </Button>
    </div>
  {:else}
    <p class={hintClass}>
      Immich isn't set up for this instance — the admin can add it in global settings. You can still paste an existing album's share link below.
    </p>
  {/if}
  <div class="mt-3">
    <div class={labelClass}>Or link an existing album</div>
    <div class="flex gap-2">
      <input bind:value={linkUrl} placeholder="https://photos.example/share/…" class="{inputClass} min-w-0 flex-1" />
      <Button variant="soft" size="md" disabled={albumBusy === 'link' || !linkUrl.trim()} onclick={() => albumAct('album_link', { url: linkUrl }, 'link')}>
        {albumBusy === 'link' ? 'Linking…' : 'Link'}
      </Button>
    </div>
  </div>
{/if}
{#if albumError}<p class="mt-1.5 font-body text-xs font-bold text-berry-600">{albumError}</p>{/if}
