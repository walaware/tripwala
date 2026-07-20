<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { gearEmoji } from '$lib/avatar.js';
  import { Card, Avatar, Button, EmptyState, Tooltip } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';

  /**
   * @type {{
   *   shareToken: string,
   *   gear: Array<any>,
   *   currentParticipantId: string | null,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { shareToken, gear, currentParticipantId, onHide = null,
    onSettings = null, collapsed = false, onToggle = null } = $props();

  const open = $derived(gear.filter((g) => g.remaining > 0).length);

  let busy = $state('');
  let adding = $state(false);
  let newName = $state('');

  /** find my claim on an item, if any */
  function myClaim(/** @type {any} */ g) {
    return g.claims.find((/** @type {any} */ c) => c.participant === currentParticipantId) ?? null;
  }

  /** @param {any} g */
  async function claim(g) {
    if (!currentParticipantId || busy) return;
    busy = g.id;
    try {
      // Server also auto-adds it to my packing list (dedupe-guarded).
      await tripAction(shareToken, { op: 'claim', gearItemId: g.id, participantId: currentParticipantId });
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  /** @param {any} g */
  async function release(g) {
    const mine = myClaim(g);
    if (!mine || busy) return;
    busy = g.id;
    try {
      await tripAction(shareToken, { op: 'release', gearItemId: g.id, participantId: currentParticipantId });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }

  async function addItem() {
    // One per line, or comma-separated — batch-add the whole list at once.
    const names = newName
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    busy = 'add';
    try {
      await tripAction(shareToken, { op: 'gear_add', names, participantId: currentParticipantId });
      newName = '';
      adding = false;
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = '';
    }
  }
</script>

<SectionHeader emoji="🎒" title="Gear" subtitle="— who's bringing what" {onHide} {onSettings} {collapsed} {onToggle}>
  {#snippet action()}
    <Tooltip label="Add gear" placement="left">
      <button
        type="button"
        aria-label="Add gear"
        onclick={() => (adding = !adding)}
        class="grid h-8 w-8 place-items-center rounded-full bg-sun-200 text-lg text-sun-600 transition active:scale-90"
      >
        ＋
      </button>
    </Tooltip>
  {/snippet}
</SectionHeader>

<Card>
  {#if gear.length === 0 && !adding}
    <EmptyState emoji="🦗" title="Nothing on the list yet" body="Add the first thing someone needs to bring." action="Add gear" onAction={() => (adding = true)} />
  {:else}
    {#each gear as g, i}
      {@const mine = myClaim(g)}
      <div class="flex items-center gap-3 py-2.5 pr-1.5 {i !== 0 ? 'border-t border-sand-200' : ''}">
        <span
          class="grid h-10 w-10 flex-none place-items-center rounded-md text-[19px]"
          style="background: {g.remaining === 0 ? 'var(--color-coral-200)' : 'var(--color-sun-200)'}"
        >
          {gearEmoji(g.category)}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-body text-[15px] font-extrabold text-cocoa-900">
            {g.qty_needed > 1 ? `${g.name} ×${g.qty_needed}` : g.name}
          </span>
          <span class="block font-body text-[12.5px] font-bold text-cocoa-500">
            {g.claims.length
              ? `${g.claims.map((/** @type {any} */ c) => c.participantName).join(' & ')} ${g.claims.length === 1 ? "'s got it" : 'have it'}`
              : 'up for grabs!'}
          </span>
        </span>
        {#if mine}
          <button
            type="button"
            disabled={busy === g.id}
            onclick={() => release(g)}
            class="flex-none rounded-full px-3 py-1.5 font-display text-[13px] font-semibold text-cocoa-500 hover:text-coral-600"
          >
            Release
          </button>
        {:else if g.remaining > 0 && currentParticipantId}
          <Button variant="secondary" size="sm" disabled={busy === g.id} onclick={() => claim(g)}>
            {busy === g.id ? '…' : "I'll bring it"}
          </Button>
        {:else if g.claims.length}
          <Avatar name={g.claims[0].participantName} size={28} />
        {/if}
      </div>
    {/each}
  {/if}

  {#if adding}
    <div class="mt-2 flex flex-col gap-2">
      <textarea
        bind:value={newName}
        placeholder={'Add gear — one per line or comma-separated\ne.g.\nTent\nStove\nHeadlamp'}
        rows="3"
        maxlength="2000"
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addItem();
        }}
        class="w-full resize-y rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[15px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
      ></textarea>
      <div class="flex items-center justify-between gap-2">
        <span class="font-body text-[11px] font-bold text-cocoa-400">One per line, or comma-separated</span>
        <Button variant="primary" size="sm" disabled={busy === 'add' || !newName.trim()} onclick={addItem}>
          Add{newName.split(/[\n,]+/).filter((s) => s.trim()).length > 1
            ? ` ${newName.split(/[\n,]+/).filter((s) => s.trim()).length}`
            : ''}
        </Button>
      </div>
    </div>
  {/if}

  {#if gear.length > 0}
    <div class="mt-2.5 text-center font-body text-xs font-extrabold text-cocoa-500">
      {open === 0 ? '🎉 All covered!' : `${open} still open`}
    </div>
  {/if}
</Card>
