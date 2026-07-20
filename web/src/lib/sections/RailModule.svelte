<script>
  import { Card, OverflowMenu } from '@walaware/design';

  /**
   * A compact rail-module summary card (the desktop dashboard rail). Header =
   * emoji + house-question title + a `⋯` OverflowMenu; body + optional footer
   * are snippets. The ⋯ menu carries "Hide this section" (organizers) and
   * "Section settings…" — the inline per-module Hide button is gone.
   *
   * @type {{
   *   emoji: string,
   *   title: string,
   *   id: string,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   onSettings: () => void,
   *   children: import('svelte').Snippet,
   *   footer?: import('svelte').Snippet
   * }}
   */
  let { emoji, title, id, ownerMode = false, onHide = null, onSettings, children, footer } = $props();

  const actions = $derived([
    ...(ownerMode && onHide ? [{ icon: '🙈', label: 'Hide this section', onClick: onHide }] : []),
    { icon: '⚙️', label: 'Section settings…', onClick: onSettings }
  ]);
</script>

<section {id} class="rail-module">
  <div class="mb-2 flex items-center gap-2 px-1">
    <span class="text-[16px] leading-none">{emoji}</span>
    <h2 class="min-w-0 flex-1 truncate font-display text-[16px] font-bold text-text-strong">{title}</h2>
    <OverflowMenu {actions} label={title} align="end" triggerLabel="{title} options" size={30} />
  </div>
  <Card>
    {@render children()}
    {#if footer}<div class="mt-3">{@render footer()}</div>{/if}
  </Card>
</section>

<style>
  .rail-module {
    scroll-margin-top: 116px;
  }
</style>
