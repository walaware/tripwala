<script>
  import { Avatar, Button, OverflowMenu } from '@walaware/design';

  /**
   * Sticky trip header for the dashboard. Emoji tile · name · meta · overlapped
   * crew avatars · a primary "＋ Add" OverflowMenu. Measured by the shell for the
   * scrollSpy offset (`data-appshell-sticky`) and collapsed into the mobile top
   * bar (title/subtitle/icon fed via the shell).
   *
   * (The mockup's "💬 Message crew" button is omitted — tripwala has no crew-chat
   * surface to back it.)
   *
   * @type {{
   *   emoji: string,
   *   name: string,
   *   meta: string,
   *   isPast?: boolean,
   *   crew?: Array<{ id: string, display_name: string, avatar?: string }>,
   *   addActions: Array<{ icon?: string, label: string, onClick?: () => void }>,
   *   manageActions?: Array<{ icon?: string, label: string, onClick?: () => void, danger?: boolean }>
   * }}
   */
  let { emoji, name, meta, isPast = false, crew = [], addActions, manageActions = [] } = $props();

  const shown = $derived(crew.slice(0, 6));
  const extra = $derived(Math.max(0, crew.length - shown.length));
</script>

<header data-appshell-sticky class="trip-head" style="background: var(--color-bg-app)">
  <div class="flex items-center gap-3">
    <span
      class="grid h-12 w-12 flex-none place-items-center rounded-md text-[26px]"
      style="background: linear-gradient(135deg, var(--color-sand-200), var(--color-sand-300))"
    >{emoji}</span>
    <div class="min-w-0 flex-1">
      <h1 class="truncate font-display text-[21px] font-bold leading-tight text-cocoa-900">{name}</h1>
      <div class="flex items-center gap-1.5">
        {#if isPast}
          <span class="flex-none rounded-full bg-berry-200 px-1.5 py-0.5 font-body text-[10px] font-extrabold text-berry-600">🎉 Wrapped</span>
        {/if}
        {#if meta}
          <div class="truncate font-body text-[13px] font-extrabold text-coral-600">{meta}</div>
        {/if}
      </div>
    </div>

    {#if shown.length}
      <div class="hidden items-center sm:flex" aria-hidden="true">
        {#each shown as p, i (p.id)}
          <span class="-ml-2 first:ml-0" style="z-index: {shown.length - i}">
            <Avatar name={p.display_name} src={p.avatar} size={30} ring />
          </span>
        {/each}
        {#if extra}
          <span class="-ml-2 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-white bg-sand-200 font-body text-[11px] font-extrabold text-cocoa-600">+{extra}</span>
        {/if}
      </div>
    {/if}

    <OverflowMenu actions={addActions} label="Add to this trip" align="end">
      {#snippet trigger({ toggle })}
        <Button variant="primary" size="sm" onclick={toggle}>＋ Add</Button>
      {/snippet}
    </OverflowMenu>

    {#if manageActions.length}
      <OverflowMenu actions={manageActions} label="Manage this trip" align="end" triggerLabel="Manage this trip" />
    {/if}
  </div>
</header>

<style>
  .trip-head {
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 16px 0 14px;
    margin-bottom: var(--stack-gap, 14px);
    border-bottom: 1px solid var(--color-sand-300);
    background: var(--color-bg-app);
    box-shadow: 0 var(--stack-gap, 14px) 0 var(--color-bg-app);
  }
</style>
