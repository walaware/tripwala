<script>
  import { labelClass, hintClass } from './styles.js';

  /**
   * The one place to change a trip's lifecycle stage (idea → planning →
   * confirmed → completed, in any direction) plus restoring sections that were
   * hidden from each section's own "Hide" button, and permanently deleting the
   * trip.
   *
   * @type {{
   *   trip: any,
   *   hiddenList: Array<[string, string]>,
   *   busy: string,
   *   act: (op: string, payload?: Record<string, unknown>, tag?: string) => Promise<void>,
   *   onSetStage: (status: string) => void,
   *   onDelete: () => void
   * }}
   */
  let { trip, hiddenList, busy, act, onSetStage, onDelete } = $props();

  // Lifecycle stages in order. Trips created before the stage field defaulted to
  // 'confirmed', so an empty status reads as confirmed (matches the dashboard).
  /** @type {Array<[string, string, string, string]>} */
  const STAGES = [
    ['idea', '💭', 'Idea', 'On the someday wishlist — off the calendar'],
    ['planning', '📝', 'In planning', 'Being planned — dates not locked in'],
    ['confirmed', '✅', 'Confirmed', 'Locked in and happening'],
    ['completed', '🏁', 'Completed', 'Wrapped up and in the rear-view']
  ];
  const current = $derived(trip.status || 'confirmed');

  const pill =
    'flex items-center gap-1.5 rounded-full border-2 border-sand-300 px-3.5 py-1.5 font-body text-[13px] font-extrabold text-cocoa-700 transition hover:border-coral-300 disabled:opacity-50';
  const stagePill =
    'flex items-center gap-2 rounded-2xl border-2 px-3.5 py-2.5 text-left font-body transition disabled:opacity-60';
</script>

<div class={labelClass}>Trip stage</div>
<p class="mb-2 {hintClass}">Move this trip through planning — pick where it's at. Everything's kept whichever stage you choose.</p>
<div class="grid gap-2 sm:grid-cols-2">
  {#each STAGES as [value, emoji, label, desc]}
    {@const isCurrent = value === current}
    <button
      type="button"
      disabled={busy === 'stage' || isCurrent}
      aria-pressed={isCurrent}
      onclick={() => onSetStage(value)}
      class="{stagePill} {isCurrent
        ? 'border-coral-400 bg-coral-50 text-cocoa-800'
        : 'border-sand-300 text-cocoa-700 hover:border-coral-300'}"
    >
      <span class="text-lg leading-none">{emoji}</span>
      <span class="min-w-0">
        <span class="block text-[13px] font-extrabold">{label}{#if isCurrent}<span class="text-coral-500"> · Now</span>{/if}</span>
        <span class="block text-[11.5px] font-semibold text-cocoa-400">{desc}</span>
      </span>
    </button>
  {/each}
</div>

{#if hiddenList.length}
  <div class="mt-4">
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

<div class="mt-4 border-t border-sand-200 pt-4">
  <div class={labelClass}>Delete trip</div>
  <p class="mb-2 {hintClass}">
    Permanently removes this trip and everything in it — itinerary, gear, expenses, photos and everyone's data. This can't be undone.
  </p>
  <button
    type="button"
    disabled={busy === 'delete'}
    onclick={onDelete}
    class="flex items-center gap-1.5 rounded-full border-2 border-red-300 px-3.5 py-1.5 font-body text-[13px] font-extrabold text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:opacity-50"
  >
    🗑️ {busy === 'delete' ? 'Deleting…' : 'Delete this trip'}
  </button>
</div>
