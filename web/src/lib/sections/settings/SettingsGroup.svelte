<script>
  import { Disclosure } from '@walaware/design';

  /**
   * One collapsible group inside the Settings card. The `hint` is a live
   * one-line summary of what's inside, so the closed accordion still answers
   * "how is this trip configured?" without opening anything.
   *
   * @type {{
   *   icon: string,
   *   title: string,
   *   hint?: string,
   *   open: boolean,
   *   onToggle: (open: boolean) => void,
   *   first?: boolean,
   *   children: import('svelte').Snippet
   * }}
   */
  let { icon, title, hint = '', open, onToggle, first = false, children } = $props();
</script>

<div class={first ? '' : 'border-t border-sand-200'}>
  <Disclosure {icon} {open} {onToggle} contentStyle="padding-bottom:14px">
    {#snippet summary()}
      <span class="flex min-w-0 flex-col">
        <span class="font-display text-[15px] font-bold text-text-strong">{title}</span>
        {#if hint}
          <span class="truncate font-body text-[12.5px] font-bold text-text-muted">{hint}</span>
        {/if}
      </span>
    {/snippet}
    {@render children()}
  </Disclosure>
</div>
