<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { Card } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import Checkbox from '$lib/ui/Checkbox.svelte';
  import { Button } from '@walaware/design';

  /**
   * @type {{
   *   shareToken: string,
   *   packing: Array<any>,
   *   currentParticipantId: string | null,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { shareToken, packing, currentParticipantId, onHide = null,
    onSettings = null, collapsed = false, onToggle = null } = $props();

  const shared = $derived(packing.filter((p) => p.is_shared));
  const mine = $derived(
    currentParticipantId ? packing.filter((p) => !p.is_shared && p.participant === currentParticipantId) : []
  );

  let busy = $state('');
  let addingShared = $state(false);
  let addingMine = $state(false);
  let sharedLabel = $state('');
  let mineLabel = $state('');

  /** @param {any} item */
  async function toggle(item) {
    if (busy) return;
    busy = item.id;
    try {
      await tripAction(shareToken, { op: 'pack_toggle', itemId: item.id });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }

  /** @param {boolean} isShared */
  async function add(isShared) {
    const labels = (isShared ? sharedLabel : mineLabel)
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!labels.length) return;
    busy = 'add';
    try {
      await tripAction(shareToken, {
        op: 'pack_add',
        labels,
        isShared,
        participantId: currentParticipantId
      });
      if (isShared) {
        sharedLabel = '';
        addingShared = false;
      } else {
        mineLabel = '';
        addingMine = false;
      }
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }
</script>

{#snippet row(/** @type {any} */ item)}
  <button
    type="button"
    disabled={busy === item.id}
    onclick={() => toggle(item)}
    class="flex w-full items-center gap-3 py-2 text-left disabled:opacity-60"
  >
    <Checkbox checked={item.checked} />
    <span class="font-body font-bold text-cocoa-900" class:line-through={item.checked} class:text-cocoa-500={item.checked}>
      {item.label}
    </span>
    {#if item.from_gear}
      <span class="ml-auto font-body text-[11px] font-extrabold text-coral-600">bringing</span>
    {/if}
  </button>
{/snippet}

{#snippet addInput(/** @type {boolean} */ isShared)}
  {@const val = isShared ? sharedLabel : mineLabel}
  {@const count = val.split(/[\n,]+/).filter((s) => s.trim()).length}
  <div class="mt-2 flex flex-col gap-2">
    <textarea
      value={val}
      oninput={(e) => {
        const v = /** @type {HTMLTextAreaElement} */ (e.currentTarget).value;
        if (isShared) sharedLabel = v;
        else mineLabel = v;
      }}
      placeholder={'Add items — one per line or comma-separated'}
      rows="3"
      maxlength="2000"
      onkeydown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(isShared);
      }}
      class="w-full resize-y rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[15px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
    ></textarea>
    <div class="flex items-center justify-between gap-2">
      <span class="font-body text-[11px] font-bold text-cocoa-400">One per line, or comma-separated</span>
      <Button variant="primary" size="sm" disabled={busy === 'add' || !count} onclick={() => add(isShared)}>
        Add{count > 1 ? ` ${count}` : ''}
      </Button>
    </div>
  </div>
{/snippet}

<SectionHeader emoji="🧳" title="Packing" subtitle="— your personal list" {onHide} {onSettings} {collapsed} {onToggle} />

<Card>
  <div class="mb-1 flex items-center justify-between">
    <p class="font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-500">Shared</p>
    {#if currentParticipantId}
      <button type="button" onclick={() => (addingShared = !addingShared)} class="font-body text-[12px] font-extrabold text-coral-600 hover:underline">＋ add</button>
    {/if}
  </div>
  {#if shared.length}
    {#each shared as p}{@render row(p)}{/each}
  {:else}
    <p class="py-1 font-body text-[13px] font-bold text-cocoa-500">Nothing shared yet.</p>
  {/if}
  {#if addingShared}{@render addInput(true)}{/if}

  {#if currentParticipantId}
    <div class="mb-1 mt-4 flex items-center justify-between">
      <p class="font-body text-[11px] font-extrabold uppercase tracking-wide text-cocoa-500">My list</p>
      <button type="button" onclick={() => (addingMine = !addingMine)} class="font-body text-[12px] font-extrabold text-coral-600 hover:underline">＋ add</button>
    </div>
    {#if mine.length}
      {#each mine as p}{@render row(p)}{/each}
    {:else}
      <p class="py-1 font-body text-[13px] font-bold text-cocoa-500">Add what you personally need to pack.</p>
    {/if}
    {#if addingMine}{@render addInput(false)}{/if}
  {/if}
</Card>
