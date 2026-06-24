<script>
  import { invalidateAll } from '$app/navigation';
  import { Card } from '@walaware/design';
  import { Button } from '@walaware/design';
  import { TextField } from '@walaware/design';
  import { EmptyState } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import { planAction } from '$lib/planClient.js';

  /**
   * @type {{
   *   shareToken: string,
   *   locations: Array<{id:string,label:string,url:string,suggester:string,votes:number,mine:boolean}>,
   *   isOrganizer: boolean,
   *   pickedLabel: string
   * }}
   */
  let { shareToken, locations, isOrganizer, pickedLabel } = $props();

  let label = $state('');
  let url = $state('');
  let busy = $state(false);
  let error = $state('');

  async function add() {
    if (!label.trim() || busy) return;
    busy = true;
    error = '';
    try {
      await planAction(shareToken, { op: 'add_location', label, url });
      label = '';
      url = '';
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
</script>

<SectionHeader emoji="📍" title="Where should we go?" />
<Card>

  {#if locations.length}
    <div class="flex flex-col gap-2">
      {#each locations as loc (loc.id)}
        <div class="flex items-center gap-2.5 rounded-xl bg-sand-100 p-2.5">
          <button
            type="button"
            onclick={() => vote(loc.id)}
            class="flex w-12 flex-none flex-col items-center rounded-lg py-1 transition {loc.mine ? 'bg-coral-500 text-white' : 'bg-white text-cocoa-700'}"
            aria-label="upvote"
          >
            <span class="text-sm leading-none">▲</span>
            <span class="font-display text-sm font-bold">{loc.votes}</span>
          </button>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="truncate font-display text-sm font-semibold text-cocoa-900">{loc.label}</span>
              {#if loc.label === pickedLabel}
                <span class="flex-none rounded-full bg-leaf-200 px-1.5 py-0.5 font-body text-[10px] font-extrabold text-leaf-600">picked</span>
              {/if}
            </div>
            {#if loc.url}
              <a href={loc.url} target="_blank" rel="noopener" class="font-body text-xs font-extrabold text-coral-600 underline">link ↗</a>
            {/if}
            {#if loc.suggester}<span class="ml-1 font-body text-xs font-bold text-cocoa-400">· {loc.suggester}</span>{/if}
          </div>
          {#if isOrganizer}
            <button type="button" onclick={() => ownerOp(loc.id, 'pick_location')} class="flex-none font-body text-xs font-extrabold text-leaf-600 hover:underline">Pick</button>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState emoji="🗺️" title="No ideas yet" body="Drop the first spot." />
  {/if}

  <div class="mt-3 flex flex-col gap-2">
    <TextField prefix="📍" placeholder="Add a place" maxlength={200} bind:value={label} />
    <div class="flex gap-2">
      <div class="flex-1"><TextField prefix="🔗" placeholder="Link (optional)" bind:value={url} /></div>
      <Button variant="soft" size="md" onclick={add} disabled={!label.trim() || busy}>Add</Button>
    </div>
    {#if error}<p class="font-body text-xs font-bold text-berry-600">{error}</p>{/if}
  </div>
</Card>
