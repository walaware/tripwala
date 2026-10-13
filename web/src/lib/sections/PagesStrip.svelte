<script>
  // Front-and-center strip for trip pages: bold chips at the top of the
  // dashboard's main column so an embedded page (the costume plan, the game)
  // is impossible to miss. Each chip deep-links straight into the sandboxed
  // viewer (?focus=pages&page=<id>) — PagesSection owns the actual iframe.
  /** @type {{ pages: Array<{ id: string, title: string }>, onOpen: (id: string) => void }} */
  let { pages, onOpen } = $props();
</script>

<div class="flex flex-wrap gap-2">
  {#each pages as p (p.id)}
    <button
      type="button"
      onclick={() => onOpen(p.id)}
      class="group flex items-center gap-2 rounded-xl border-2 border-coral-200 bg-white px-3.5 py-2 shadow-sm transition hover:border-coral-400 hover:shadow-md"
    >
      <span class="text-[17px]" aria-hidden="true">📄</span>
      <span class="font-body text-[14px] font-extrabold text-cocoa-900 group-hover:text-coral-600">{p.title}</span>
      <span class="font-body text-[13px] font-extrabold text-coral-600">Open →</span>
    </button>
  {/each}
</div>
