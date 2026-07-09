<script>
  import { labelClass, hintClass } from './styles.js';

  /**
   * Trip stage (back to the Ideas wishlist) and restoring sections that were
   * hidden from each section's own "Hide" button.
   *
   * @type {{
   *   trip: any,
   *   hiddenList: Array<[string, string]>,
   *   busy: string,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>,
   *   onDemote: () => void
   * }}
   */
  let { trip, hiddenList, busy, act, onDemote } = $props();

  const pill =
    'flex items-center gap-1.5 rounded-full border-2 border-sand-300 px-3.5 py-1.5 font-body text-[13px] font-extrabold text-cocoa-700 transition hover:border-coral-300 disabled:opacity-50';
</script>

{#if trip.status !== 'idea'}
  <div class={labelClass}>Trip stage</div>
  <p class="mb-2 {hintClass}">
    Not happening yet? Move it back to your Ideas wishlist — everything's kept, it just leaves the calendar.
  </p>
  <button type="button" disabled={busy === 'demote'} onclick={onDemote} class={pill}>
    💭 {busy === 'demote' ? 'Moving…' : 'Move back to Ideas'}
  </button>
{/if}

{#if hiddenList.length}
  <div class="{trip.status !== 'idea' ? 'mt-4' : ''}">
    <div class={labelClass}>Hidden sections</div>
    <p class="mb-2 {hintClass}">Hidden for everyone on the trip — restore any to bring it back.</p>
    <div class="flex flex-wrap gap-2">
      {#each hiddenList as [key, label]}
        <button
          type="button" disabled={busy === 'sec-' + key}
          onclick={() => act('section_show', { key }, 'sec-' + key)}
          class={pill}
        >{label} <span class="text-cocoa-400">· Restore</span></button>
      {/each}
    </div>
  </div>
{/if}
