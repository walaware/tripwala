<script>
  /**
   * Section header that sits ABOVE its Card (the 2026-06-23 design cleanup —
   * docs/apps/tripwala.md → "Layout conventions"). Emoji (17px) + h2 (display
   * 600, 18px) + optional muted subtitle, with an optional right-aligned action
   * (chips, an add button) via the `action` snippet.
   *
   * @type {{
   *   emoji: string,
   *   title: string,
   *   subtitle?: string,
   *   action?: import('svelte').Snippet,
   *   onHide?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { emoji, title, subtitle = '', action, onHide = null, collapsed = false, onToggle = null } = $props();
</script>

<div class="mb-2.5 flex items-center gap-2.5 px-1">
  {#if onToggle}
    <button
      type="button" onclick={onToggle} aria-expanded={!collapsed}
      class="flex min-w-0 items-center gap-2.5 text-left"
    >
      <span class="text-cocoa-400 transition-transform duration-150 {collapsed ? '' : 'rotate-90'}" aria-hidden="true">▸</span>
      <span class="text-[17px] leading-none">{emoji}</span>
      <h2 class="truncate font-display text-[18px] font-semibold leading-tight text-cocoa-900">{title}</h2>
      {#if subtitle}
        <span class="hidden font-body text-[13px] font-bold text-cocoa-500 sm:inline">{subtitle}</span>
      {/if}
    </button>
  {:else}
    <span class="text-[17px] leading-none">{emoji}</span>
    <h2 class="font-display text-[18px] font-semibold leading-tight text-cocoa-900">{title}</h2>
    {#if subtitle}
      <span class="font-body text-[13px] font-bold text-cocoa-500">{subtitle}</span>
    {/if}
  {/if}
  {#if action || onHide}
    <span class="ml-auto flex items-center gap-2">
      {#if action}{@render action()}{/if}
      {#if onHide}
        <button
          type="button"
          onclick={onHide}
          title="Hide this section for everyone (restore from Settings)"
          class="rounded-full px-2 py-0.5 font-body text-[12px] font-extrabold text-cocoa-400 transition hover:bg-sand-200 hover:text-cocoa-600"
        >Hide</button>
      {/if}
    </span>
  {/if}
</div>
