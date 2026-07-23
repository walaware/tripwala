<script>
  import { Button, OverflowMenu } from '@walaware/design';

  /**
   * Sticky trip header for the dashboard. Emoji tile · name · meta · a primary
   * "＋ Add" OverflowMenu. Measured by the shell for the scrollSpy offset
   * (`data-appshell-sticky`) and collapsed into the mobile top bar
   * (title/subtitle/icon fed via the shell).
   *
   * Crew avatars used to sit immediately left of "＋ Add", which read as
   * "＋ Add [a person]" — and they were decorative (aria-hidden, not clickable,
   * capped at 6, no RSVP status). People live in one place now: the "Who's in"
   * card, where a face also carries its status. The header's `meta` line still
   * carries the headline count.
   *
   * (The mockup's "💬 Message crew" button is omitted — tripwala has no crew-chat
   * surface to back it.)
   *
   * Trip management (edit, clone, photos, leave, stage, delete) lives in the one
   * Trip settings home (the sidebar ⚙ / mobile trip-home row / each module's
   * gear) — the header carries only ＋ Add, so there's no second, overlapping
   * manage surface competing with settings.
   *
   * @type {{
   *   emoji: string,
   *   name: string,
   *   meta: string,
   *   isPast?: boolean,
   *   addActions: Array<{ icon?: string, label: string, onClick?: () => void }>
   * }}
   */
  let { emoji, name, meta, isPast = false, addActions } = $props();
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

    <OverflowMenu actions={addActions} label="Add to this trip" align="end">
      {#snippet trigger({ toggle })}
        <Button variant="primary" size="sm" onclick={toggle}>＋ Add</Button>
      {/snippet}
    </OverflowMenu>
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
