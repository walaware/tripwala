<script>
  // Fullscreen viewer for a trip page, rendered by TripView whenever ?page=<id>
  // is in the URL — independent of which module has focus, so a strip chip on
  // the dashboard opens it there and closing returns EXACTLY where you were
  // (close = drop only the `page` param). The iframe's sandbox attribute is the
  // SECOND layer — the served document already carries CSP `sandbox
  // allow-scripts allow-popups` (opaque origin). Keep the two lists identical.
  /**
   * @type {{
   *   shareToken: string,
   *   page: { id: string, title: string },
   *   onClose: () => void
   * }}
   */
  let { shareToken, page, onClose } = $props();

  const src = $derived(`/${encodeURIComponent(shareToken)}/page/${encodeURIComponent(page.id)}`);
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-cocoa-900/60 p-3 sm:p-6" role="dialog" aria-label={page.title}>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
    <div class="flex flex-none items-center gap-2 border-b-2 border-sand-200 px-4 py-2.5">
      <span class="text-[15px]" aria-hidden="true">📄</span>
      <span class="min-w-0 flex-1 truncate font-body text-[14.5px] font-extrabold text-cocoa-900">{page.title}</span>
      <a href={src} target="_blank" rel="noopener noreferrer" class="flex-none font-body text-[12.5px] font-bold text-cocoa-400 hover:text-coral-600">new tab ↗</a>
      <button type="button" aria-label="Close" onclick={onClose} class="flex-none px-2 font-body text-[16px] font-extrabold text-cocoa-400 hover:text-cocoa-900">✕</button>
    </div>
    <iframe {src} title={page.title} sandbox="allow-scripts allow-popups" class="h-full w-full flex-1 border-0"></iframe>
  </div>
</div>
