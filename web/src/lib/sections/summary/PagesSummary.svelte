<script>
  // Rail summary for Trip pages — the embedded HTML views. Lists the first few
  // titles; opening goes to the full module (which hosts the sandboxed viewer).
  /** @type {{ pages: Array<{ id: string, title: string }>, onOpen: () => void }} */
  let { pages, onOpen } = $props();

  const label = $derived(pages.length ? `${pages.length} page${pages.length === 1 ? '' : 's'}` : 'No pages yet');
</script>

<button type="button" class="block w-full text-left" onclick={onOpen}>
  {#if pages.length}
    <div class="flex flex-col gap-1">
      {#each pages.slice(0, 3) as p (p.id)}
        <span class="truncate font-body text-[13px] font-bold text-cocoa-700">📄 {p.title}</span>
      {/each}
    </div>
  {/if}
  <div class="mt-2.5 flex items-center gap-2">
    <span class="min-w-0 flex-1 truncate font-body text-[13.5px] font-extrabold text-text-strong">{label}</span>
    <span class="flex-none font-body text-[13px] font-extrabold text-coral-600">Open →</span>
  </div>
</button>
