<script>
  /**
   * Mobile trip home (hub & spoke): a tappable status list — one row per active
   * module (emoji · house-question · live status line · ▸) — then a dashed Trip
   * settings row. Tapping a row opens that module focused ("spoke"). No long
   * scroll. (The Countdown / Next-up tiles are the StatStrip above this.)
   *
   * @type {{
   *   rows: Array<{ key: string, emoji: string, title: string, status: string, hot?: boolean }>,
   *   onOpen: (key: string) => void,
   *   onSettings: () => void
   * }}
   */
  let { rows, onOpen, onSettings } = $props();
</script>

<div class="flex flex-col gap-2">
  {#each rows as r (r.key)}
    <button type="button" class="hub-row" onclick={() => onOpen(r.key)}>
      <span class="hub-tile">{r.emoji}</span>
      <span class="min-w-0 flex-1 text-left">
        <span class="block truncate font-body text-[14.5px] font-extrabold text-text-strong">{r.title}</span>
        <span class="block truncate font-body text-[12.5px] font-bold" style="color: {r.hot ? 'var(--color-primary-press, var(--color-coral-700))' : 'var(--color-text-muted)'}">{r.status}</span>
      </span>
      <span class="flex-none font-body text-[16px] text-cocoa-300" aria-hidden="true">▸</span>
    </button>
  {/each}

  <button type="button" class="settings-row" onclick={onSettings}>
    ⚙️ Trip settings — sections, invites, notifications
  </button>
</div>

<style>
  .hub-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 10px 12px;
    border-radius: var(--radius-lg, 14px);
    background: var(--color-surface-card);
    box-shadow: var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.06));
    transition: filter 0.15s;
  }
  .hub-row:hover {
    filter: brightness(0.99);
  }
  .hub-tile {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 10px;
    font-size: 20px;
    background: var(--color-sand-200);
  }
  .settings-row {
    text-align: left;
    border: 1.5px dashed var(--color-sand-300);
    border-radius: var(--radius-md, 10px);
    padding: 12px 14px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 800;
    color: var(--color-text-muted);
    transition: border-color 0.15s;
  }
  .settings-row:hover {
    border-color: var(--color-coral-300);
  }
</style>
