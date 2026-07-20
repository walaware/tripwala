<script>
  import { Button } from '@walaware/design';

  /**
   * Compact claim/progress meter shared by the Packing / Gear / Food rail
   * summaries: an X-of-Y bar, a couple of still-open rows (their action opens the
   * focused module), and a footer link. Fully done → a celebratory line.
   *
   * @type {{
   *   done: number,
   *   total: number,
   *   doneLabel?: string,
   *   open?: Array<{ key: string, emoji: string, label: string }>,
   *   claimLabel?: string,
   *   allDoneMsg?: string,
   *   emptyMsg?: string,
   *   seeAllLabel: string,
   *   onOpen: () => void
   * }}
   */
  let {
    done, total, doneLabel = 'Claimed', open = [], claimLabel = '🙋 Claim',
    allDoneMsg = '🎉 All done', emptyMsg = 'Nothing here yet.', seeAllLabel, onOpen
  } = $props();

  const pct = $derived(total ? Math.round((done / total) * 100) : 0);
  const rows = $derived(open.slice(0, 2));
  const linkClass = 'mt-3 block font-body text-[13px] font-extrabold text-coral-600 hover:underline';
</script>

{#if total === 0}
  <p class="py-1 font-body text-[13px] font-bold text-text-muted">{emptyMsg}</p>
  <button type="button" class={linkClass} onclick={onOpen}>{seeAllLabel}</button>
{:else}
  <div class="mb-1.5 flex items-center justify-between">
    <span class="font-body text-[12.5px] font-extrabold text-text-muted">{doneLabel}</span>
    <span class="font-body text-[12.5px] font-extrabold text-text-muted">{done} of {total}</span>
  </div>
  <div class="h-2 overflow-hidden rounded-full bg-sand-300">
    <div class="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300" style="width: {pct}%"></div>
  </div>

  {#if done >= total}
    <p class="mt-2.5 font-body text-[13px] font-extrabold text-leaf-600">{allDoneMsg}</p>
  {:else}
    <div class="mt-2.5 flex flex-col">
      {#each rows as r (r.key)}
        <div class="flex items-center gap-2.5 py-1.5">
          <span class="w-6 flex-none text-center text-[16px]">{r.emoji}</span>
          <span class="min-w-0 flex-1 truncate font-body text-[13.5px] font-extrabold text-text-strong">{r.label}</span>
          <Button variant="soft" size="sm" onclick={onOpen}>{claimLabel}</Button>
        </div>
      {/each}
    </div>
  {/if}
  <button type="button" class={linkClass} onclick={onOpen}>{seeAllLabel}</button>
{/if}
