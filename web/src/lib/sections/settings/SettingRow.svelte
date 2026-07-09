<script>
  /**
   * A single setting: icon, name, one line of explanation, and its control.
   *
   * @type {{
   *   icon: string,
   *   title: string,
   *   desc?: string,
   *   first?: boolean,
   *   control?: import('svelte').Snippet
   * }}
   */
  let { icon, title, desc = '', first = false, control } = $props();
</script>

<div class="flex items-center gap-3 py-2.5 {first ? '' : 'border-t border-sand-200'}">
  <span class="w-6 flex-none text-center text-[18px]" aria-hidden="true">{icon}</span>
  <div class="min-w-0 flex-1">
    <div class="font-body text-[14.5px] font-extrabold text-text-strong">{title}</div>
    {#if desc}<div class="font-body text-[12.5px] font-bold text-text-muted">{desc}</div>{/if}
  </div>
  {#if control}<div class="flex-none">{@render control()}</div>{/if}
</div>
