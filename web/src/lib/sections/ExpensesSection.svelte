<script>
  import { invalidateAll } from '$app/navigation';
  import { tripAction } from '$lib/tripClient.js';
  import { Card, Avatar, Button, EmptyState, IconButton, Tooltip } from '@walaware/design';
  import SectionHeader from '$lib/ui/SectionHeader.svelte';

  /**
   * @type {{
   *   shareToken: string,
   *   expenses: Array<{ id: string, title: string, amount: number, paidBy: string | null, paidByName: string }>,
   *   settlement: { total: number, perPerson: number, net: Array<{ id: string, name: string, net: number }>, settlements: Array<any> },
   *   currentParticipantId: string | null,
   *   ownerMode?: boolean,
   *   onHide?: (() => void) | null,
   *   onSettings?: (() => void) | null,
   *   collapsed?: boolean,
   *   onToggle?: (() => void) | null
   * }}
   */
  let { shareToken, expenses, settlement, currentParticipantId, ownerMode = false, onHide = null,
    onSettings = null, collapsed = false, onToggle = null } = $props();

  /** @param {number} n */
  const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

  const myNet = $derived(settlement.net.find((x) => x.id === currentParticipantId)?.net ?? 0);

  let adding = $state(false);
  let title = $state('');
  let amount = $state('');
  let busy = $state(false);

  async function add() {
    const amt = parseFloat(amount);
    if (!title.trim() || !(amt > 0) || busy) return;
    busy = true;
    try {
      await tripAction(shareToken, { op: 'expense_add', title: title.trim(), amount: amt });
      title = '';
      amount = '';
      adding = false;
      await invalidateAll();
    } catch (_) {
      /* reconciled on next load */
    } finally {
      busy = false;
    }
  }

  /** @param {string} id */
  async function remove(id) {
    if (busy) return;
    busy = true;
    try {
      await tripAction(shareToken, { op: 'expense_delete', expenseId: id });
      await invalidateAll();
    } catch (_) {
      /* reconciled */
    } finally {
      busy = false;
    }
  }
</script>

<SectionHeader emoji="💸" title="Expenses" {onHide} {onSettings} {collapsed} {onToggle}>
  {#snippet action()}
    {#if currentParticipantId && expenses.length}
      <Tooltip label="Add an expense" placement="left">
        <button
          type="button"
          aria-label="Add an expense"
          onclick={() => (adding = !adding)}
          class="grid h-8 w-8 place-items-center rounded-full bg-berry-200 text-lg text-berry-600 transition active:scale-90"
        >＋</button>
      </Tooltip>
    {/if}
  {/snippet}
</SectionHeader>
<Card>
  {#if expenses.length}
    {#each expenses as e, i}
      <div class="group flex items-center gap-3 py-2.5 {i !== 0 ? 'border-t border-sand-200' : ''}">
        <Avatar name={e.paidByName} size={28} />
        <span class="min-w-0 flex-1">
          <span class="block font-body text-[14px] font-extrabold text-cocoa-900">{e.paidByName}</span>
          <span class="block font-body text-[12.5px] font-bold text-cocoa-500">{e.title}</span>
        </span>
        {#if (e.paidBy === currentParticipantId || ownerMode) && currentParticipantId}
          <button
            type="button"
            disabled={busy}
            aria-label="Remove expense"
            onclick={() => remove(e.id)}
            class="hidden shrink-0 rounded-full px-2 font-body text-[12px] font-bold text-cocoa-400 hover:text-berry-600 group-hover:block"
          >Remove</button>
        {/if}
        <span class="shrink-0 font-display text-[16px] font-bold text-cocoa-900">{money(e.amount)}</span>
      </div>
    {/each}

    <!-- Settle-up: your net + the per-person share. -->
    <div class="mt-3.5 flex items-center justify-between gap-3 rounded-md bg-primary-soft px-4 py-3">
      <span class="font-display text-[15px] font-bold text-[var(--color-primary-press)]">
        {#if Math.abs(myNet) < 0.01}All settled up 🎉
        {:else if myNet > 0}You're owed {money(myNet)}
        {:else}You owe {money(-myNet)}{/if}
      </span>
      <span class="font-body text-[13px] font-extrabold text-[var(--color-primary-press)]">{money(settlement.perPerson)} each</span>
    </div>
  {:else}
    <EmptyState
      emoji="🧾"
      title="No expenses yet"
      body="Add what people paid for and tripwala splits it evenly and shows who owes whom."
      action={currentParticipantId ? 'Add an expense' : undefined}
      onAction={currentParticipantId ? () => (adding = true) : undefined}
    />
  {/if}

  {#if adding && currentParticipantId}
    <div class="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        bind:value={title}
        placeholder="What was it for?"
        maxlength="200"
        class="flex-1 rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[15px] font-bold text-cocoa-900 outline-none focus:border-coral-400"
      />
      <input
        bind:value={amount}
        type="number"
        inputmode="decimal"
        min="0"
        step="0.01"
        placeholder="$0"
        class="rounded-md border-2 border-sand-300 bg-white px-3 py-2 font-body text-[15px] font-bold text-cocoa-900 outline-none focus:border-coral-400 sm:w-28"
      />
      <Button variant="primary" size="sm" disabled={busy || !title.trim() || !(parseFloat(amount) > 0)} onclick={add}>
        Add
      </Button>
    </div>
  {/if}
</Card>
