<script>
  import { invalidateAll } from '$app/navigation';
  import { Card } from '@walaware/design';
  import { Button } from '@walaware/design';
  import { TextField } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { planAction, planUpload } from '$lib/planClient.js';
  import { cardImage, cardDomain, tintIndex } from '$lib/locationCard.js';

  /**
   * @type {{
   *   shareToken: string,
   *   locations: Array<{id:string,label:string,url:string,note:string,suggester:string,mineParticipant:string,image?:string,previewImage?:string,previewTitle?:string,previewDescription?:string,votes:number,mine:boolean}>,
   *   isOrganizer: boolean,
   *   pickedLabel: string,
   *   currentParticipantId: string | null
   * }}
   */
  let { shareToken, locations, isOrganizer, pickedLabel, currentParticipantId } = $props();

  // The add form stays collapsed until you tap the "＋" card — name, link and
  // note only take up space while you're actually adding one.
  let adding = $state(false);
  let label = $state('');
  let url = $state('');
  let note = $state('');
  let busy = $state(false);
  let error = $state('');

  // Per-card upload state: a single hidden input, targeted at one idea at a time.
  /** @type {HTMLInputElement | undefined} */
  let fileInput = $state();
  let uploadTargetId = $state('');
  let uploadingId = $state('');
  let dragId = $state('');

  // You can set a card's photo if you suggested it (or you're the organizer).
  /** @param {{mineParticipant:string}} loc */
  const canEdit = (loc) => isOrganizer || (!!currentParticipantId && loc.mineParticipant === currentParticipantId);

  const TINTS = [
    'linear-gradient(135deg, var(--color-coral-200), var(--color-coral-300))',
    'linear-gradient(135deg, var(--color-leaf-200), var(--color-leaf-300))',
    'linear-gradient(135deg, var(--color-sky-200, var(--color-sand-200)), var(--color-sand-300))',
    'linear-gradient(135deg, var(--color-berry-200), var(--color-berry-300))',
    'linear-gradient(135deg, var(--color-sand-200), var(--color-sand-300))'
  ];

  function resetForm() {
    label = '';
    url = '';
    note = '';
    error = '';
  }

  async function add() {
    if (!label.trim() || busy) return;
    busy = true;
    error = '';
    try {
      await planAction(shareToken, { op: 'add_location', label, url, note });
      resetForm();
      adding = false;
      await invalidateAll();
    } catch (_) {
      error = 'Could not add that — check the link starts with http(s)://';
    } finally {
      busy = false;
    }
  }

  /** @param {string} ideaId */
  async function vote(ideaId) {
    try {
      await planAction(shareToken, { op: 'vote_location', ideaId });
      await invalidateAll();
    } catch (_) {
      await invalidateAll();
    }
  }

  /** @param {string} ideaId @param {string} op */
  async function ownerOp(ideaId, op) {
    try {
      await planAction(shareToken, { op, ideaId });
      await invalidateAll();
    } catch (_) {
      await invalidateAll();
    }
  }

  /** @param {string} id */
  function pickPhotoFor(id) {
    uploadTargetId = id;
    fileInput?.click();
  }

  /** @param {Event} e */
  async function onFileChange(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    input.value = '';
    if (file) await doUpload(uploadTargetId, file);
  }

  /** @param {string} id @param {File} file */
  async function doUpload(id, file) {
    if (!file.type.startsWith('image/')) {
      error = 'That needs to be an image (JPG, PNG…).';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      error = 'Image must be under 5 MB.';
      return;
    }
    uploadingId = id;
    error = '';
    try {
      await planUpload(shareToken, { op: 'set_location_image', ideaId: id }, file);
      await invalidateAll();
    } catch (_) {
      error = 'Could not upload that image — try a different one.';
    } finally {
      uploadingId = '';
    }
  }

  /** @param {string} id @param {DragEvent} e */
  async function onDrop(id, e) {
    e.preventDefault();
    dragId = '';
    const file = e.dataTransfer?.files?.[0];
    if (file) await doUpload(id, file);
  }
</script>

<SectionHeader emoji="📍" title="Where should we go?" />
<Card>
  {#if error}
    <p class="mb-2 rounded-lg bg-berry-200 px-3 py-2 font-body text-xs font-bold text-berry-600">{error}</p>
  {/if}

  <!-- Horizontal, snap-scrolling row of idea cards + a trailing "add" card. -->
  <div class="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
    {#each locations as loc (loc.id)}
      {@const img = cardImage(loc)}
      {@const picked = loc.label === pickedLabel}
      <div
        class="flex w-[208px] flex-none snap-start flex-col overflow-hidden rounded-2xl border-2 bg-white transition {picked ? 'border-leaf-400' : 'border-sand-200'}"
      >
        <!-- Media: custom image > link preview > tinted placeholder. Drop target. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="relative h-28 w-full overflow-hidden {dragId === loc.id ? 'ring-2 ring-coral-400' : ''}"
          style={img.src ? '' : `background: ${TINTS[tintIndex(loc.label)]}`}
          ondragover={(e) => {
            if (canEdit(loc)) {
              e.preventDefault();
              dragId = loc.id;
            }
          }}
          ondragleave={() => (dragId === loc.id ? (dragId = '') : null)}
          ondrop={(e) => canEdit(loc) && onDrop(loc.id, e)}
        >
          {#if img.src}
            <img src={img.src} alt={loc.label} class="h-full w-full object-cover" loading="lazy" />
          {:else}
            <div class="flex h-full w-full items-center justify-center text-cocoa-500/70">
              <span class="text-4xl" aria-hidden="true">📍</span>
            </div>
          {/if}

          {#if uploadingId === loc.id}
            <div class="absolute inset-0 grid place-items-center bg-cocoa-900/40 font-body text-xs font-extrabold text-white">
              Uploading…
            </div>
          {/if}

          <!-- Vote control, overlaid bottom-left. -->
          <button
            type="button"
            onclick={() => vote(loc.id)}
            class="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full px-2 py-1 font-body text-xs font-bold shadow-sm transition {loc.mine ? 'bg-coral-500 text-white' : 'bg-white/95 text-cocoa-700'}"
            aria-label="upvote"
          >
            <span class="leading-none">▲</span>
            <span class="font-display font-bold leading-none">{loc.votes}</span>
          </button>

          {#if canEdit(loc)}
            <!-- Camera = upload/replace. ✕ = remove a custom image. -->
            <button
              type="button"
              onclick={() => pickPhotoFor(loc.id)}
              title={img.isCustom ? 'Replace photo' : 'Add a photo'}
              class="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-sm shadow-sm transition hover:bg-white"
            >📷</button>
            {#if img.isCustom}
              <button
                type="button"
                onclick={() => ownerOp(loc.id, 'remove_location_image')}
                title="Remove photo"
                class="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-cocoa-900/60 font-body text-[11px] font-extrabold text-white transition hover:bg-cocoa-900/80"
              >✕</button>
            {/if}
          {/if}
        </div>

        <!-- Body: title, note, link · suggester, organizer Pick. -->
        <div class="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
          <div class="flex items-start gap-1.5">
            <h3 class="min-w-0 flex-1 break-words font-display text-sm font-semibold leading-snug text-cocoa-900">{loc.label}</h3>
            {#if picked}
              <span class="mt-0.5 flex-none rounded-full bg-leaf-200 px-1.5 py-0.5 font-body text-[10px] font-extrabold text-leaf-600">picked</span>
            {/if}
          </div>

          {#if loc.note}
            <p class="line-clamp-3 whitespace-pre-line break-words font-body text-xs font-bold text-cocoa-600">{loc.note}</p>
          {/if}

          <div class="mt-auto flex flex-wrap items-center gap-x-1.5 pt-1">
            {#if loc.url}
              <a href={loc.url} target="_blank" rel="noopener" class="truncate font-body text-xs font-extrabold text-coral-600 underline">{cardDomain(loc.url) || 'link'} ↗</a>
            {/if}
            {#if loc.suggester}
              <span class="truncate font-body text-xs font-bold text-cocoa-400">{loc.url ? '· ' : ''}{loc.suggester}</span>
            {/if}
          </div>

          {#if isOrganizer && !picked}
            <button
              type="button"
              onclick={() => ownerOp(loc.id, 'pick_location')}
              class="mt-1 rounded-lg bg-leaf-100 py-1.5 font-body text-xs font-extrabold text-leaf-600 transition hover:bg-leaf-200"
            >Pick this</button>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Trailing add card (always present so adding feels part of the row). -->
    <button
      type="button"
      onclick={() => (adding = true)}
      class="flex w-[208px] flex-none snap-start flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-sand-300 py-10 font-body text-[13px] font-extrabold text-cocoa-500 transition hover:border-coral-300 hover:text-coral-600"
    >
      <span class="text-2xl" aria-hidden="true">➕</span>
      Add a place
    </button>
  </div>

  {#if !locations.length && !adding}
    <p class="mt-1 font-body text-[13px] font-bold text-cocoa-500">No ideas yet — drop the first spot. 🗺️</p>
  {/if}

  {#if adding}
    <div class="mt-3 flex flex-col gap-2 rounded-xl bg-sand-100 p-3">
      <!-- svelte-ignore a11y_autofocus -->
      <TextField prefix="📍" placeholder="Place name" maxlength={200} bind:value={label} autofocus />
      <TextField prefix="🔗" placeholder="Link (optional) — we'll grab a preview" bind:value={url} />
      <TextField prefix="📝" placeholder="Note (optional) — drive time, vibe, cost…" maxlength={500} bind:value={note} />
      {#if error}<p class="font-body text-xs font-bold text-berry-600">{error}</p>{/if}
      <div class="flex gap-2">
        <Button variant="soft" size="sm" onclick={add} disabled={!label.trim() || busy}>{busy ? 'Adding…' : 'Add place'}</Button>
        <Button variant="ghost" size="sm" onclick={() => { resetForm(); adding = false; }} disabled={busy}>Cancel</Button>
      </div>
    </div>
  {/if}

  <!-- One hidden input drives every card's "📷" upload. -->
  <input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={onFileChange} />
</Card>
