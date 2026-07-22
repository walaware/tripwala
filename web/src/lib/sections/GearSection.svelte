<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { gearEmoji } from '$lib/avatar.js';
  import { Card, Avatar, Button, EmptyState, Tooltip } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';
  import Checkbox from '$lib/ui/Checkbox.svelte';
  import { publicListApplies, quantitiesApply, isShared } from '$lib/bring.js';

  /**
   * Everything to bring, on one surface — the two lists the trip actually has:
   *
   *   THE GROUP'S LIST (public)  what the crew needs, and who's got it. An item
   *                              with no claim is a request ("we need a tent");
   *                              one with a claim is covered ("Sam's bringing
   *                              it"). Same row, two entry points — asked for,
   *                              or offered up. Sorted needed-first server-side.
   *
   *   YOUR PACK (private)        only ever yours; other people's items never
   *                              reach the browser. The 👁 toggle puts one on
   *                              the group's list as something you're bringing.
   *
   * Organizer RECOMMENDATIONS appear in your pack as ghost rows — a suggestion,
   * not an item, until you tap to adopt it.
   *
   * On a solo trip the public list is hidden entirely: "who's bringing this?"
   * has only one possible answer.
   *
   * @type {{
   *   shareToken: string,
   *   gear: Array<any>,
   *   packing?: Array<any>,
   *   currentParticipantId: string | null,
   *   participantCount?: number,
   *   isOrganizer?: boolean,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { shareToken, gear, packing = [], currentParticipantId, participantCount = 0,
    isOrganizer = false, onHide = null, onSettings = null, collapsed = false,
    onToggle = null } = $props();

  const showPublic = $derived(publicListApplies(participantCount));
  const showQty = $derived(quantitiesApply(participantCount));
  const open = $derived(gear.filter((g) => g.remaining > 0).length);

  const mine = $derived(packing.filter((p) => !p.recommended));
  const suggestions = $derived(packing.filter((p) => p.recommended));
  const packed = $derived(mine.filter((p) => p.checked).length);

  let busy = $state('');
  /** which add box is open: '' | 'group' | 'mine' | 'recommend' */
  let adding = $state('');
  let draft = $state('');

  /** @param {Record<string, unknown>} payload @param {string} tag */
  async function act(payload, tag) {
    if (busy) return;
    busy = tag;
    try {
      await tripAction(shareToken, { ...payload, participantId: currentParticipantId });
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = '';
    }
  }

  /** find my claim on a public item, if any */
  const myClaim = (/** @type {any} */ g) =>
    g.claims.find((/** @type {any} */ c) => c.participant === currentParticipantId) ?? null;

  const labels = $derived(draft.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean));

  async function submitDraft() {
    if (!labels.length) return;
    const op = adding === 'group' ? 'gear_add' : adding === 'recommend' ? 'recommend_add' : 'pack_add';
    const payload = op === 'gear_add' ? { op, names: labels } : { op, labels };
    const where = adding;
    await act(payload, 'add');
    draft = '';
    if (adding === where) adding = '';
  }

  /** @param {string} target */
  function openAdd(target) {
    adding = adding === target ? '' : target;
    draft = '';
  }
</script>

<SectionHeader emoji="🎒" title="Gear" subtitle="— what to bring" {onHide} {onSettings} {collapsed} {onToggle}>
  {#snippet action()}
    {#if currentParticipantId}
      <Tooltip label="Add to your pack" placement="left">
        <button
          type="button"
          aria-label="Add to your pack"
          onclick={() => openAdd('mine')}
          class="grid h-8 w-8 place-items-center rounded-full bg-sun-200 text-lg text-sun-600 transition active:scale-90"
        >＋</button>
      </Tooltip>
    {/if}
  {/snippet}
</SectionHeader>

{#snippet addBox(/** @type {string} */ target, /** @type {string} */ placeholder)}
  {#if adding === target}
    <div class="mt-2 flex flex-col gap-2">
      <textarea
        bind:value={draft}
        {placeholder}
        rows="3"
        maxlength="2000"
        onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitDraft(); }}
        class="w-full resize-y rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[15px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
      ></textarea>
      <div class="flex items-center justify-between gap-2">
        <span class="font-body text-[11px] font-bold text-cocoa-400">One per line, or comma-separated</span>
        <Button variant="primary" size="sm" disabled={busy === 'add' || !labels.length} onclick={submitDraft}>
          Add{labels.length > 1 ? ` ${labels.length}` : ''}
        </Button>
      </div>
    </div>
  {/if}
{/snippet}

<!-- ── The group's list ───────────────────────────────────────────────────── -->
{#if showPublic}
  <Card>
    <div class="mb-1 flex items-baseline justify-between gap-2">
      <span class="font-body text-[12.5px] font-extrabold text-cocoa-500">🙌 The group's list</span>
      {#if gear.length}
        <span class="font-body text-[12px] font-bold text-cocoa-400">
          {open === 0 ? '🎉 all covered' : `${open} still needed`}
        </span>
      {/if}
    </div>

    {#if gear.length === 0 && adding !== 'group'}
      <EmptyState
        emoji="🦗"
        title="Nothing on the list yet"
        body="Add what the group needs, and anyone can claim it."
        action="Add an item"
        onAction={() => openAdd('group')}
      />
    {:else}
      {#each gear as g, i (g.id)}
        {@const claimed = myClaim(g)}
        <div class="flex items-center gap-3 py-2.5 pr-1.5 {i !== 0 ? 'border-t border-sand-200' : ''}">
          <span
            class="grid h-10 w-10 flex-none place-items-center rounded-md text-[19px]"
            style="background: {g.remaining === 0 ? 'var(--color-coral-200)' : 'var(--color-sun-200)'}"
          >{gearEmoji(g.category)}</span>
          <span class="min-w-0 flex-1">
            <span class="block font-body text-[15px] font-extrabold text-cocoa-900">
              {showQty && g.qty_needed > 1 ? `${g.name} ×${g.qty_needed}` : g.name}
            </span>
            <span class="block font-body text-[12.5px] font-bold text-cocoa-500">
              {g.claims.length
                ? `${g.claims.map((/** @type {any} */ c) => c.participantName).join(' & ')} ${g.claims.length === 1 ? "'s got it" : 'have it'}`
                : 'up for grabs!'}
            </span>
          </span>
          {#if claimed}
            <button
              type="button"
              disabled={busy === g.id}
              onclick={() => act({ op: 'release', gearItemId: g.id }, g.id)}
              class="flex-none rounded-full px-3 py-1.5 font-display text-[13px] font-semibold text-cocoa-500 hover:text-coral-600"
            >Release</button>
          {:else if g.remaining > 0 && currentParticipantId}
            <Button variant="secondary" size="sm" disabled={busy === g.id} onclick={() => act({ op: 'claim', gearItemId: g.id }, g.id)}>
              {busy === g.id ? '…' : "I'll bring it"}
            </Button>
          {:else if g.claims.length}
            <Avatar name={g.claims[0].participantName} size={28} />
          {/if}
        </div>
      {/each}
    {/if}

    {@render addBox('group', 'What does the group need?\ne.g.\nTent\nStove\nHeadlamp')}

    {#if currentParticipantId && (gear.length > 0 || adding === 'group')}
      <button
        type="button"
        onclick={() => openAdd('group')}
        class="mt-2 font-body text-[12.5px] font-extrabold text-coral-600 hover:underline"
      >＋ Add something the group needs</button>
    {/if}
  </Card>
{/if}

<!-- ── Your pack ──────────────────────────────────────────────────────────── -->
{#if currentParticipantId}
  <Card class={showPublic ? 'mt-3' : ''}>
    <div class="mb-1 flex items-baseline justify-between gap-2">
      <span class="font-body text-[12.5px] font-extrabold text-cocoa-500">🧳 Your pack</span>
      {#if mine.length}
        <span class="font-body text-[12px] font-bold text-cocoa-400">{packed} of {mine.length} packed</span>
      {/if}
    </div>
    <p class="mb-2 font-body text-[11.5px] font-bold text-cocoa-400">
      Only you can see this{#if showPublic} — tap 👁 to tell the crew you're bringing something{/if}.
    </p>

    {#each mine as item (item.id)}
      <div class="flex items-center gap-2 border-t border-sand-200 py-2 first:border-t-0">
        <button
          type="button"
          disabled={busy === item.id}
          onclick={() => act({ op: 'pack_toggle', itemId: item.id }, item.id)}
          class="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
        >
          <Checkbox checked={item.checked} />
          <span
            class="truncate font-body font-bold text-cocoa-900"
            class:line-through={item.checked}
            class:text-cocoa-500={item.checked}
          >{item.label}</span>
        </button>

        {#if showPublic}
          <Tooltip label={isShared(item) ? "Crew can see you're bringing this" : 'Show the crew you have this'} placement="left">
            <button
              type="button"
              disabled={busy === item.id}
              aria-pressed={isShared(item)}
              aria-label={isShared(item) ? 'Hide from crew' : 'Show the crew you have this'}
              onclick={() => act({ op: isShared(item) ? 'pack_unshare' : 'pack_share', itemId: item.id }, item.id)}
              class="grid h-7 w-7 flex-none place-items-center rounded-full text-[13px] transition
                {isShared(item) ? 'bg-coral-200 opacity-100' : 'opacity-35 hover:opacity-70'}"
            >👁</button>
          </Tooltip>
        {/if}

        <button
          type="button"
          disabled={busy === item.id}
          aria-label="Remove {item.label}"
          onclick={() => act({ op: 'pack_delete', itemId: item.id }, item.id)}
          class="flex-none rounded-full px-1.5 py-1 font-body text-[13px] font-extrabold text-cocoa-400 hover:text-berry-600"
        >×</button>
      </div>
    {/each}

    <!-- Organizer suggestions: not yours until you take one. -->
    {#each suggestions as s (s.id)}
      <div class="flex items-center gap-2 border-t border-sand-200 py-2 first:border-t-0">
        <button
          type="button"
          disabled={busy === s.id}
          onclick={() => act({ op: 'pack_adopt', itemId: s.id }, s.id)}
          class="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
        >
          <span class="grid h-[18px] w-[18px] flex-none place-items-center rounded border-2 border-dashed border-sand-300 text-[10px] text-cocoa-400">＋</span>
          <span class="truncate font-body font-bold text-cocoa-400">{s.label}</span>
          <span class="flex-none font-body text-[10.5px] font-extrabold uppercase tracking-wide text-cocoa-300">suggested</span>
        </button>
        {#if isOrganizer}
          <button
            type="button"
            disabled={busy === s.id}
            aria-label="Withdraw suggestion {s.label}"
            onclick={() => act({ op: 'recommend_remove', itemId: s.id }, s.id)}
            class="flex-none rounded-full px-1.5 py-1 font-body text-[13px] font-extrabold text-cocoa-400 hover:text-berry-600"
          >×</button>
        {/if}
      </div>
    {/each}

    {#if !mine.length && !suggestions.length && adding !== 'mine'}
      <p class="py-1 font-body text-[12.5px] font-bold text-cocoa-400">
        Nothing in your pack yet — add what you personally need to bring.
      </p>
    {/if}

    {@render addBox('mine', 'Add to your pack — one per line\ne.g.\nSocks\nToothbrush\nSunscreen')}

    <button
      type="button"
      onclick={() => openAdd('mine')}
      class="mt-2 font-body text-[12.5px] font-extrabold text-coral-600 hover:underline"
    >＋ Add to your pack</button>

    {#if isOrganizer}
      <div class="mt-3 border-t border-sand-200 pt-2.5">
        {@render addBox('recommend', "Suggest to everyone — one per line\ne.g.\nWarm layer\nHeadlamp\nSunscreen")}
        <button
          type="button"
          onclick={() => openAdd('recommend')}
          class="font-body text-[12.5px] font-extrabold text-cocoa-500 hover:text-coral-600 hover:underline"
        >✨ Suggest items to the crew</button>
      </div>
    {/if}
  </Card>
{/if}
